import { centerStage } from '@/src/project/styles/css-helpers';
import Image from 'next/image';
import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className={centerStage}>
      <Image
        src="/images/not-found.webp"
        alt="Confused beaver"
        width={250}
        height={250}
        priority
      />
      <h1>Page not found.</h1>
      <p>
        The requested page does not exist or is no longer available at this address.
      </p>
      <Link href="/">Back to homepage</Link>
    </main>
  );
}
