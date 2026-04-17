import { Tabs } from "./Tabs";
import { UserMenu } from "./UserMenu";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { SoundToggle } from "./SoundToggle";

/**
 * Sticky top navigation bar containing the brand wordmark, page tabs,
 * connection indicator, sound toggle, and user menu.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-6">
        {/* TODO: replace wordmark with the real brand logo/text */}
        <span className="text-sm font-semibold tracking-[0.25em]">BRAND</span>
        <Tabs />
      </div>
      <div className="flex items-center gap-4">
        <ConnectionIndicator />
        <SoundToggle />
        <UserMenu />
      </div>
    </header>
  );
}
