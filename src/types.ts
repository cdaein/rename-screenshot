// import { categories } from ".";

export type Options = {
  /** image resolution used for inference */
  detail: "high" | "low" | "auto";
  /** directory renamed images are saved to */
  outdir: string;
  /** API provider */
  provider: "openai" | "ollama";
  /** process existing screenshots? */
  retroactive: boolean;
  /** Folder to watch screenshots from */
  watchdir: string;
  /** continue monitor new screenshots */
  watch: boolean;
};

/** API Provider options */
export type ProviderOptions = {
  baseURL: string;
  model: string;
  maxTokens: number;
};

// export type Category = keyof typeof categories;

export type Config = {
  categories: Record<string, string>;
  ollama: ProviderOptions;
  openai: ProviderOptions;
};

export type JsonResponse = {
  /** One of the predefined categories */
  category?: string;
  /** New filename created by chatGPT. doesn't include extension */
  filename: string;
};
