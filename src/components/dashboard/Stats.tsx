
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Stat } from "@/lib/types";

interface StatsProps {
  stats: Stat[];
}

const Stats = ({ stats }: StatsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card key={index} className="overflow-hidden animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
          <CardContent className="p-6">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-muted-foreground">
                {stat.name}
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold tracking-tight">
                  {stat.value}
                </span>
                <span
                  className={`flex items-center text-xs font-medium ${
                    stat.trend === "up"
                      ? "text-emerald-600"
                      : stat.trend === "down"
                      ? "text-rose-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {stat.trend === "up" ? (
                    <ArrowUp size={12} className="mr-1" />
                  ) : stat.trend === "down" ? (
                    <ArrowDown size={12} className="mr-1" />
                  ) : null}
                  {stat.change}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Stats;
