import { HotelLayout } from '@/components/pms/hotel-context';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <HotelLayout>{children}</HotelLayout>;
}
