import { useState } from "react";
import { Search, Star } from "lucide-react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface AITool {
  id: string;
  name: string;
  description: string;
  icon: string;
  whenToUse: string;
  strengths: string[];
  weaknesses: string[];
  enabled: boolean;
  comingSoon?: boolean;
}

const initialTools: AITool[] = [
  {
    id: "1",
    name: "Search (Perplexity)",
    description:
      "AI-powered search engine: up-to-date information for docs, libraries, etc.",
    icon: "🔍",
    whenToUse:
      "When you need to find information where the latest, most up-to-date version is important, e.g. documentation, software libraries, etc. Regular LLMs' knowledge are outdated by several months, so they will not be as good as Perplexity for such use cases",
    strengths: [
      "Most up-to-date information",
      "Non coding specific questions are also supported",
      "Provides cited sources",
    ],
    weaknesses: [
      "May be wordy and verbose",
      "Not specialized for pure code generation",
    ],
    enabled: true,
  },
  {
    id: "2",
    name: "AI Chat (Continue)",
    description: "AI pair programmer for flexible coding assistance",
    icon: "👨‍💻",
    whenToUse:
      "When you need fragmented coding assistance and suggestions. Ask the chat any question, it can generate code decently well and also create files. Requires medium human intervention to apply and review changes.",
    strengths: [
      "AI chat (CMD/CTRL+L and CMD/CTRL+I)",
      "Context-aware suggestions",
      "Code and file generation",
      "Flexibility on choosing what you want to keep and discard from suggestions",
    ],
    weaknesses: [
      "The flexibility also means it requires at least a medium level of human intervention",
    ],
    enabled: true,
  },
  {
    id: "3",
    name: "Memory (mem0)",
    description:
      "Personalization: let the AI remember your past thoughts (coming soon)",
    icon: "📝",
    whenToUse:
      "When you want the AI to remember insights from past prompts you've given it. It can automatically remember details like what version of for e.g. Python you're using, or other specific details of your codebase, like your coding styles, or your expertise level",
    strengths: [
      "Intelligent memory of your coding profile",
      "Increase in accuracy of results due to personalization",
    ],
    weaknesses: [
      "Requires you to remove expired memories manually that are no longer relevant",
      "Requires PearAI server due to essential custom logic",
    ],
    enabled: false,
  },
  {
    id: "4",
    name: "Creator (aider)",
    description: '"No-code" assistant: complete features zero to one directly',
    icon: "🤖",
    whenToUse:
      "When you need a feature or bug fixes investigated, or completed directly. Requires lower human intervention.",
    strengths: [
      "Zero to one feature completions",
      "Automated refactoring",
      "Lower level of human intervention needed",
    ],
    weaknesses: [
      "Lower level of human intervention needed means less flexibility on what to keep and discard from suggestions",
    ],
    enabled: true,
  },
  {
    id: "5",
    name: "Painter (DALL-E)",
    description: "AI image generation from textual descriptions",
    icon: "🎨",
    whenToUse:
      "Use when you need to create unique images based on text prompts",
    strengths: [
      "Creative image generation",
      "Wide range of styles",
      "Quick results",
    ],
    weaknesses: [
      "May misinterpret complex prompts",
      "Limited control over specific details",
    ],
    enabled: false,
    comingSoon: true,
  },
];

const suggestedBuild = ["1", "2", "4"]; // IDs of suggested tools

function AIToolCard({
  tool,
  onClick,
  onToggle,
}: {
  tool: AITool;
  onClick: () => void;
  onToggle: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all ${tool.enabled ? "bg-input" : "bg-button"} ${tool.comingSoon ? "opacity-50" : ""}`}
      onClick={tool.comingSoon ? undefined : onClick}
    >
      <CardContent className="p-2 px-4">
        <div className="flex items-center justify-between">
          <div className="text-lg bg-primary/10 rounded-full">{tool.icon}</div>
          <Switch
            checked={tool.comingSoon ? false : true} // always enabled
            aria-label={`Toggle ${tool.name}`}
            disabled={true} // disable toggle for now
            className={`bg-button text-button-foreground border border-input rounded-full transition-colors duration-200 ease-in-out ${
              tool.comingSoon ? "opacity-50" : "opacity-100"
            }`}
          />
        </div>
        <h3
          className={`text-sm font-semibold ${tool.enabled ? "text-button-foreground" : ""} transition-colors`}
        >
          {tool.name}
        </h3>
        <p
          className={`text-xs ${tool.enabled ? "text-button-foreground" : "text-muted-foreground"}`}
        >
          {tool.comingSoon ? "Coming soon" : tool.description}
        </p>
      </CardContent>
    </Card>
  );
}

interface QuickActionSlotProps {
  tool: AITool | null;
  onRemove: () => void;
}

function QuickActionSlot({ tool, onRemove }: QuickActionSlotProps) {
  return (
    <div
      className={`relative w-24 h-24 rounded-lg shadow-sm transition-all duration-200 ease-in-out
                  flex flex-col items-center justify-center space-y-2
                  hover:shadow-md
                  ${tool ? "bg-button" : "bg-input"}
                  ${tool ? "border border-input-border" : "border border-dashed border-input-border"}`}
    >
      {tool ? (
        <>
          <div className="text-3xl text-foreground">{tool.icon}</div>
          <div className="text-xs font-medium text-center text-button-foreground px-2 line-clamp-2">
            {tool.name}
          </div>
          <button
            className="absolute top-0.5 right-1 p-0.5 m-1 text-foreground/50
                       bg-button hover:bg-button-hover border-0
                       rounded-md duration-200 ease-in-out"
            onClick={onRemove}
            aria-label={`Remove ${tool.name} from quick action slot`}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </>
      ) : (
        <div className="text-sm text-foreground/50">Empty</div>
      )}
    </div>
  );
}

export default function AIToolInventory() {
  const [tools, setTools] = useState<AITool[]>(initialTools);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedTool, setFocusedTool] = useState<AITool | null>(null);
  const [quickSlots, setQuickSlots] = useState<(AITool | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const navigate = useNavigate();

  const filteredTools = tools.filter((tool) =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleToggle = (id: string) => {
    setTools(
      tools.map((tool) =>
        tool.id === id ? { ...tool, enabled: !tool.enabled } : tool,
      ),
    );
  };

  const handleEquipToQuickSlot = (tool: AITool) => {
    const emptySlotIndex = quickSlots.findIndex((slot) => slot === null);
    if (
      emptySlotIndex !== -1 &&
      !quickSlots.find((slot) => slot?.id === tool.id)
    ) {
      const newQuickSlots = [...quickSlots];
      newQuickSlots[emptySlotIndex] = tool;
      setQuickSlots(newQuickSlots);
    }
  };

  const handleRemoveFromQuickSlot = (index: number) => {
    const newQuickSlots = [...quickSlots];
    newQuickSlots[index] = null;
    setQuickSlots(newQuickSlots);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-y-auto bg-background text-foreground">
        <header className="flex-none mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold mb-2">PearAI Inventory</h1>
            <Badge variant="outline" className="pl-0">
              Beta
            </Badge>
            <div className="relative mt-2 w-full max-w-md">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground opacity-60"
                size={18}
              />
              <Input
                type="text"
                placeholder="Search AI tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-3 w-full bg-input text-foreground border border-input rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                aria-label="Search AI tools"
              />
            </div>

            <Button
              onClick={() => navigate("/")}
              className="mt-3 ml-auto bg-input text-foreground cursor-pointer"
            >
              Back to Dashboard
            </Button>
          </div>
        </header>

        <main className="flex-1 flex gap-4 min-h-0">
          <div className="w-1/2 flex flex-col">
            <div className="flex-1 overflow-y-auto pr-4 border-solid rounded-2xl p-2">
              <div className="grid grid-cols-2 gap-4">
                {filteredTools.map((tool) => (
                  <AIToolCard
                    key={tool.id}
                    tool={tool}
                    onClick={() => setFocusedTool(tool)}
                    onToggle={() => handleToggle(tool.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="w-1/2 overflow-y-auto pl-4 border-l border-input text-sm border-solid rounded-2xl p-2">
            {focusedTool ? (
              <div>
                <h2 className="text-lg font-bold mb-2">
                  {focusedTool.name} {focusedTool.icon}
                </h2>
                <p className="mb-2">{focusedTool.description.split(":")[0]}</p>{" "}
                {/* Shortened description */}
                <h3 className="font-semibold mb-1">Usage:</h3>
                <p className="mb-2">
                  {focusedTool.whenToUse.split(".")[0]}
                </p>{" "}
                {/* Shortened usage details */}
                <h3 className="font-semibold mb-1">Strengths:</h3>
                <ul className="list-disc mb-2 pl-4">
                  {focusedTool.strengths.map((strength, index) => (
                    <li key={index}>{strength}</li>
                  ))}
                </ul>
                <h3 className="font-semibold mb-1">Weaknesses:</h3>
                <ul className="list-disc mb-2 pl-4">
                  {focusedTool.weaknesses.map((weakness, index) => (
                    <li key={index}>{weakness}</li>
                  ))}
                </ul>
                {!focusedTool.comingSoon && (
                  <div className="mt-2">
                    <Button
                      className="bg-button text-button-foreground hover:bg-button-hover cursor-pointer text-xs"
                      onClick={() => handleEquipToQuickSlot(focusedTool)}
                    >
                      Equip to quick slots
                    </Button>
                    {quickSlots.every((slot) => slot !== null) && (
                      <p className="text-destructive mt-1 text-xs">
                        Quick slots are full
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-foreground opacity-60 mt-4">
                <p className="text-sm font-medium">No tool selected</p>
                <p className="text-xs">Select a tool to view its details</p>
              </div>
            )}
          </div>
        </main>

        <footer className="flex-none mt-2 mb-2 p-2">
          <h3 className="font-semibold text-sm mb-2">Quick Action Slots</h3>
          <div className="flex gap-1 mb-2">
            {quickSlots.map((slot, index) => (
              <QuickActionSlot
                key={index}
                tool={slot}
                onRemove={() => handleRemoveFromQuickSlot(index)}
              />
            ))}
          </div>
          <div className="flex mt-6 items-center text-xs">
            <Star className="text-accent mr-1" size={14} />
            <span className="font-medium">Suggested Build:</span>
            <div className="flex ml-2 space-x-1">
              {suggestedBuild.map((id) => {
                const tool = tools.find((t) => t.id === id);
                return tool ? (
                  <Tooltip key={id}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center bg-button text-button-foreground rounded-full px-2 py-0.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <span className="mr-1">{tool.icon}</span>
                        <span className="truncate">{tool.name}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{tool.description}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : null;
              })}
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
