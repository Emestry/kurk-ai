import Image from "next/image";
import { Tabs, TabsMenu } from "./Tabs";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { SoundToggle } from "./SoundToggle";

/**
 * Sticky top navigation bar containing the brand lockup, page tabs,
 * connection indicator and sound toggle.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Image
            src="/logo-highres.png"
            alt="Kurk AI"
            width={32}
            height={32}
            priority
            unoptimized
            className="h-7 w-7"
          />
          <Image
            src="/text-highres.png"
            alt="Kurk AI"
            width={120}
            height={24}
            priority
            unoptimized
            className="h-5 w-auto"
          />
        </div>
        <Tabs />
      </div>
      <div className="flex items-center gap-4">
        <ConnectionIndicator />
        <SoundToggle />
        <TabsMenu />
      </div>
    </header>
  );
}
