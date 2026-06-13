import type { Metadata } from "next";
import { SavedResourceBrowser } from "@/components/SavedResourceBrowser";

export const metadata: Metadata = {
  title: "Saved | Subskills",
  description: "Resources you saved on this device.",
};

export default function SavedPage() {
  return <SavedResourceBrowser />;
}
