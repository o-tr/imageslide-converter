import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash } from "lucide-react";
import type React from "react";
import type { SignboardConfig } from "./types";

interface SignboardTableHeaderProps {
  config: SignboardConfig;
  renameSignboard: (idx: number, name: string) => void;
  removeSignboard: (idx: number) => void;
}

export const SignboardTableHeader: React.FC<SignboardTableHeaderProps> = ({
  config,
  renameSignboard,
  removeSignboard,
}) => {
  return (
    <thead>
      <tr>
        <th className="px-4 py-2 text-left">#</th>
        <th className="px-4 py-2 text-left min-w-[100px] w-[100px] max-w-[100px]">
          表示秒数
        </th>
        {config.signboards.map((sb, sbIdx) => (
          <th
            key={sb.id}
            className="text-left max-w-[320px] min-w-[320px] w-[320px]"
          >
            <div className="flex justify-between items-center">
              <Input
                value={sb.name}
                onChange={(e) => renameSignboard(sbIdx, e.target.value)}
              />
              {config.signboards.length > 1 && (
                <Button
                  type="button"
                  onClick={() => removeSignboard(sbIdx)}
                  variant={"destructive"}
                  size={"sm"}
                >
                  <Trash />
                </Button>
              )}
            </div>
          </th>
        ))}
        <th className="px-4 py-2 text-left" />
      </tr>
    </thead>
  );
};
