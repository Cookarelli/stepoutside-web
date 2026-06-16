import { useCallback, useEffect, useState } from "react";

import { getPremiumStatus, type PremiumStatus } from "../src/lib/pro";

type UsePremiumAccessResult = PremiumStatus & {
  isLoading: boolean;
  refreshPremiumStatus: () => Promise<void>;
};

export function usePremiumAccess(): UsePremiumAccessResult {
  const [isPremium, setIsPremium] = useState(false);
  const [plan, setPlan] = useState<PremiumStatus["plan"]>(null);
  const [membershipLabel, setMembershipLabel] = useState("Free Plan");
  const [customerInfo, setCustomerInfo] = useState<PremiumStatus["customerInfo"]>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPremiumStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await getPremiumStatus();
      setIsPremium(next.isPremium);
      setPlan(next.plan);
      setMembershipLabel(next.membershipLabel);
      setCustomerInfo(next.customerInfo);
      setError(next.error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPremiumStatus();
  }, [refreshPremiumStatus]);

  return {
    isPremium,
    plan,
    membershipLabel,
    isLoading,
    customerInfo,
    error,
    refreshPremiumStatus,
  };
}
