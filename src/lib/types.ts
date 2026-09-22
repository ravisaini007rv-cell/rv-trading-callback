export type Attachment = {
  id: string;
  name: string;
  mime: string;
  /** data: URL for images, plain text for text-ish files */
  dataUrl?: string;
  text?: string;
};

export type ToolRun = {
  id: string;
  tool: string;
  args: Record<string, string>;
  status: "running" | "done" | "error";
  result?: string;
  imageUrl?: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  modelLabel?: string;
  createdAt: number;
  /** generated image url, when the message is an image result */
  imageUrl?: string;
  toolRuns?: ToolRun[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  modelId: string;
  updatedAt: number;
  agent?: boolean;
};

export type Keys = {
  groq?: string;
  gemini?: string;
  openrouter?: string;
};

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
