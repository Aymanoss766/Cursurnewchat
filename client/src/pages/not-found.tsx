import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/40 p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">404</h1>
          <p className="text-muted-foreground mb-6">
            The page you're looking for doesn't exist.
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"} className="rounded-xl">
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
