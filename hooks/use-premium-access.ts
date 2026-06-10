import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "@firebase/auth";

import { getPremiumStatus, type PremiumStatus } from "../src/lib/pro";
import { auth } from "../src/lib/firebase";

type UsePremiumAccessResult = PremiumStatus & {
  isLoading: boolean;
  refreshPremiumStatus: () => Promise<void>;
};

export function usePremiumAccess(): UsePremiumAccessResult {
  const [isPremium, setIsPremium] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<PremiumStatus["customerInfo"]>(null);
  const [error, setError] = useState<Error | null>(null);
  const [source, setSource] = useState<PremiumStatus["source"]>("cached");
  const [overrideReason, setOverrideReason] = useState<PremiumStatus["overrideReason"]>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPremiumStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await getPremiumStatus();
      setIsPremium(next.isPremium);
      setCustomerInfo(next.customerInfo);
      setError(next.error);
      setSource(next.source);
      setOverrideReason(next.overrideReason);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPremiumStatus();
  }, [refreshPremiumStatus]);

  useEffect(() => {
    return onAuthStateChanged(auth, () => {
      void refreshPremiumStatus();
    });
  }, [refreshPremiumStatus]);

  return {
    isPremium,
    isLoading,
    customerInfo,
    error,
    source,
    overrideReason,
    refreshPremiumStatus,
  };
}
