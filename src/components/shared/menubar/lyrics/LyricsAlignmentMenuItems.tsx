import { MenubarCheckboxItem } from "@/components/ui/menubar";
import { LyricsAlignment } from "@/types/lyrics";

export type LyricsAlignmentMenuItemsProps = {
  lyricsAlignment: LyricsAlignment;
  setLyricsAlignment: (alignment: LyricsAlignment) => void;
  multiLabel: string;
  singleLabel: string;
  alternatingLabel: string;
};

export function LyricsAlignmentMenuItems({
  lyricsAlignment,
  setLyricsAlignment,
  multiLabel,
  singleLabel,
  alternatingLabel,
}: LyricsAlignmentMenuItemsProps) {
  return (
    <>
      <MenubarCheckboxItem
        checked={lyricsAlignment === LyricsAlignment.FocusThree}
        onCheckedChange={(checked) => {
          if (checked) setLyricsAlignment(LyricsAlignment.FocusThree);
        }}
        className="text-md h-6 pr-3"
      >
        {multiLabel}
      </MenubarCheckboxItem>
      <MenubarCheckboxItem
        checked={lyricsAlignment === LyricsAlignment.Center}
        onCheckedChange={(checked) => {
          if (checked) setLyricsAlignment(LyricsAlignment.Center);
        }}
        className="text-md h-6 pr-3"
      >
        {singleLabel}
      </MenubarCheckboxItem>
      <MenubarCheckboxItem
        checked={lyricsAlignment === LyricsAlignment.Alternating}
        onCheckedChange={(checked) => {
          if (checked) setLyricsAlignment(LyricsAlignment.Alternating);
        }}
        className="text-md h-6 pr-3"
      >
        {alternatingLabel}
      </MenubarCheckboxItem>
    </>
  );
}
