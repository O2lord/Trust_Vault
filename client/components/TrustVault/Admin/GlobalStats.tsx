import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, Activity } from "lucide-react";

interface GlobalStatsProps {
  globalState?: any;
}

export function GlobalStats({ globalState }: GlobalStatsProps) {
  const stats = [
    {
      title: "Total Orders Created",
      value: globalState?.totalTrustExpressCreated?.toString() || '0',
      icon: ShoppingCart,
      description: "Lifetime orders",
      color: "text-blue-500"
    },
    {
      title: "Total Orders Closed",
      value: globalState?.totalTrustExpressClosed?.toString() || '0',
      icon: TrendingDown,
      description: "Completed/cancelled",
      color: "text-green-500"
    },
    {
      title: "Total Confirmations",
      value: globalState?.totalConfirmations?.toString() || '0',
      icon: Activity,
      description: "Successful trades",
      color: "text-purple-500"
    },
    {
      title: "Total Volume",
      value: globalState?.totalVolume?.toString() || '0',
      icon: DollarSign,
      description: "Platform volume",
      color: "text-orange-500"
    },
    {
      title: "High Watermark",
      value: globalState?.highWatermarkVolume?.toString() || '0',
      icon: TrendingUp,
      description: "Peak volume",
      color: "text-red-500"
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}

      {/* Fee Info Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Current Fee Rate
          </CardTitle>
          <DollarSign className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {globalState?.feePercentage ? 
              `${(globalState.feePercentage / 100).toFixed(2)}%` : 
              '0.05%'
            }
          </div>
          <p className="text-xs text-muted-foreground">
            {globalState?.feePercentage || '5'} basis points
          </p>
        </CardContent>
      </Card>

      {/* Status Cards */}
      <Card className={globalState?.buyOrdersPaused ? 'border-red-500' : 'border-green-500'}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Buy Orders
          </CardTitle>
          <ShoppingCart className={`h-4 w-4 ${globalState?.buyOrdersPaused ? 'text-red-500' : 'text-green-500'}`} />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${globalState?.buyOrdersPaused ? 'text-red-500' : 'text-green-500'}`}>
            {globalState?.buyOrdersPaused ? 'Paused' : 'Active'}
          </div>
          <p className="text-xs text-muted-foreground">
            Current status
          </p>
        </CardContent>
      </Card>

      <Card className={globalState?.sellOrdersPaused ? 'border-red-500' : 'border-green-500'}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Sell Orders
          </CardTitle>
          <ShoppingCart className={`h-4 w-4 ${globalState?.sellOrdersPaused ? 'text-red-500' : 'text-green-500'}`} />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${globalState?.sellOrdersPaused ? 'text-red-500' : 'text-green-500'}`}>
            {globalState?.sellOrdersPaused ? 'Paused' : 'Active'}
          </div>
          <p className="text-xs text-muted-foreground">
            Current status
          </p>
        </CardContent>
      </Card>
    </div>
  );
}