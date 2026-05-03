import { Metadata } from "next";
import TrustVaultChat from "@/components/TrustExpress/Chat/TrustVaultChat";

export const metadata: Metadata = {
  title: "Trust Vault AI Chat",
};

export default function WidgetPage(): JSX.Element {
  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      <TrustVaultChat embedded={true} />
    </div>
  );
}