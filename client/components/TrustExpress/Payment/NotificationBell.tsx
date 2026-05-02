// components/NotificationBell.tsx
"use client";
import React, { useEffect } from "react";
import { Bell } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Notification {
  id: string;
  user_wallet: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  data?: {
    requestId?: string;
  };
}

const NotificationBell: React.FC = () => {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Debug: Log wallet connection
  useEffect(() => {
    if (publicKey) {
      
    } else {
      
    }
  }, [publicKey]);

  // Fetch unread notifications
  const { data: notifications, error: fetchError, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) {
        
        return [];
      }

      const walletAddress = publicKey.toString();
      

      try {
        // First get all notifications to see actual stored values
        const { data: allData } = await supabase
          .from('notifications')
          .select('*')
          .limit(10);

        if (allData && allData.length > 0) {
          
          
          
          
          
        }

        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_wallet', walletAddress)
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          console.error("❌ Supabase fetch error:", error);
          return [];
        }

        
        return data || [];
      } catch (err) {
        console.error("❌ Fetch exception:", err);
        return [];
      }
    },
    enabled: !!publicKey,
    refetchInterval: 30000,
  });

  // Log fetch errors
  useEffect(() => {
    if (fetchError) {
      console.error("❌ Query error:", fetchError);
    }
  }, [fetchError]);

  // Real-time subscription
  useEffect(() => {
    if (!publicKey) {
      
      return;
    }

    const fullWalletAddress = publicKey.toString();
    const walletAddress = fullWalletAddress;
    

    const channel = supabase
      .channel(`notifications-${walletAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_wallet=eq.${walletAddress}`,
        },
        (payload) => {
          
          toast.info(payload.new.title || 'New notification');
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
        }
      )
      .subscribe((status) => {
        
      });

    return () => {
      
      supabase.removeChannel(channel);
    };
  }, [publicKey, queryClient]);

  const markAsRead = async (id: string) => {
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) {
        console.error("❌ Error marking as read:", error);
        return;
      }

      
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      console.error("❌ Mark as read exception:", err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    
    markAsRead(notification.id);

    if (notification.type === 'payment_request' && notification.data?.requestId) {
      
      router.push('/requests');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {notifications && notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
              {notifications.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-gray-800 border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h3 className="font-semibold text-white">Notifications</h3>
          {isLoading && <p className="text-xs text-gray-500">Loading...</p>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              No new notifications
            </div>
          ) : (
            notifications.map((notification: Notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="p-4 cursor-pointer hover:bg-gray-700"
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="space-y-1">
                  <div className="font-medium text-white text-sm">
                    {notification.title}
                  </div>
                  <div className="text-xs text-gray-400">
                    {notification.message}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(notification.created_at).toLocaleString()}
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;