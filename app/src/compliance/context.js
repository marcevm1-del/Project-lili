// The context lives alone, in one module, so there is exactly one of it.
//
// This file exists because of a real bug: "./ComplianceProvider" and
// "./ComplianceProvider.jsx" resolved as two separate modules, which created
// two separate React contexts. The provider filled one; the marketplace read
// the other and got null. Keeping createContext in a leaf module that everyone
// imports the same way makes that failure structurally impossible.
import { createContext, useContext } from "react";

export const ComplianceContext = createContext(null);

export function useCompliance() {
  const ctx = useContext(ComplianceContext);
  if (!ctx) {
    throw new Error(
      "useCompliance() was called outside <ComplianceProvider>. If the provider " +
      "is definitely above this component, check for duplicate module instances " +
      "— import paths must match exactly, extension included."
    );
  }
  return ctx;
}
