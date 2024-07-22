import { categories } from ".";

export type Options = {
  /** image resolution used for inference */
  detail: "high" | "low" | "auto";
  /** directory renamed images are saved to */
  outdir: string;
  /** API provider */
  provider: "openai" | "ollama";
  /** process existing screenshots? */
  retroactive: boolean;
  /** continue monitor new screenshots */
  watch: boolean;
};

export type Category = keyof typeof categories;

export type JsonResponse = {
  /** One of the predefined categories */
  category?: Category;
  /** New filename created by chatGPT. doesn't include extension */
  filename: string;
};
