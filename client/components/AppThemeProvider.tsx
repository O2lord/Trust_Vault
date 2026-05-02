import { ThemeProvider } from "next-themes";
import React from "react";

function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      forcedTheme="light"
      themes={["light"]}
      disableTransitionOnChange={false}
    >
      {children}
    </ThemeProvider>
  );
}
export default AppThemeProvider;