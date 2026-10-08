import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Last line of defence: known HTTP errors pass through, Prisma errors get a
 * sensible status, anything else is logged and hidden from the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (err instanceof HttpException) {
      return res.status(err.getStatus()).json(err.getResponse());
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: duplicateMessage(err),
        });
      }
      if (err.code === 'P2025') {
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ statusCode: HttpStatus.NOT_FOUND, message: 'Not found' });
      }
      if (err.code === 'P2034') {
        // serialization conflict between two tills, safe to try again
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'Someone else changed this at the same moment. Please try again.',
        });
      }
    }

    this.logger.error(`${req.method} ${req.url}`, err instanceof Error ? err.stack : String(err));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong',
    });
  }
}

function duplicateMessage(err: Prisma.PrismaClientKnownRequestError) {
  const target = String(err.meta?.target ?? '');
  if (target.includes('email')) return 'This email is already in use';
  if (target.includes('shortCode')) return 'Another item already uses this short code';
  if (target.includes('phone')) return 'A customer with this number already exists';
  if (target.includes('name')) return 'That name is already taken';
  if (target.includes('code')) return 'That code is already taken';
  return 'Already exists';
}
