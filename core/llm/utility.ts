import { MessageContent } from "../index";

export function stripImages(content: MessageContent): string {
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  } else {
    return content;
  }
}
