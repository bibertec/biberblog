import homeContent from '@/src/project/content/home.json';
import { pageMetadata } from '@/src/system/content/seo';

export const metadata = pageMetadata(homeContent);

export default function HomePage() {
  return (
    <div>
      <main>
        {/* PLOP_INJECT_MODULE – optional: new modules are inserted here (otherwise at the end of <main>) */}
      </main>
    </div>
  );
}
