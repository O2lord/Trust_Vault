import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Beneficiary {
  id: string;
  user_wallet: string;
  nickname: string;
  wallet_address: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export const useBeneficiaries = (userWallet?: string) => {
  const queryClient = useQueryClient();

  const { data: beneficiaries = [], isLoading } = useQuery({
    queryKey: ['beneficiaries', userWallet],
    queryFn: async () => {
      if (!userWallet) return [];
      
      const response = await fetch(`/api/beneficiaries?userWallet=${userWallet}`);
      if (!response.ok) throw new Error('Failed to fetch beneficiaries');
      return response.json();
    },
    enabled: !!userWallet,
  });

  const saveBeneficiary = useMutation({
    mutationFn: async (data: Omit<Beneficiary, 'id' | 'created_at' | 'updated_at'>) => {
      const response = await fetch('/api/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to save beneficiary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaries', userWallet] });
    },
  });

  const deleteBeneficiary = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/beneficiaries/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete beneficiary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaries', userWallet] });
    },
  });

  return {
    beneficiaries,
    isLoading,
    saveBeneficiary,
    deleteBeneficiary,
  };
};