
import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Course } from "@/lib/types";
import { useToast } from "@/components/ui/use-toast";
import { CreditCard, Check } from "lucide-react";

interface StripeCheckoutProps {
  course: Course;
  onCancel: () => void;
}

const StripeCheckout = ({ course, onCancel }: StripeCheckoutProps) => {
  const { toast } = useToast();
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const formatCardNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    
    // Split into groups of 4 digits
    let formatted = "";
    for (let i = 0; i < digits.length; i += 4) {
      formatted += digits.slice(i, i + 4) + " ";
    }
    
    // Trim any trailing space
    return formatted.trim();
  };

  const formatExpiry = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    
    // Format as MM/YY
    if (digits.length <= 2) {
      return digits;
    }
    
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    // Limit to 19 characters (16 digits + 3 spaces)
    setCardNumber(formatted.slice(0, 19));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiry(e.target.value);
    // Limit to 5 characters (MM/YY)
    setExpiry(formatted.slice(0, 5));
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits and limit to 3-4 characters
    const digits = e.target.value.replace(/\D/g, "");
    setCvc(digits.slice(0, 4));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cardNumber || !expiry || !cvc || !name) {
      toast({
        title: "Error",
        description: "Please fill in all payment details",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    
    // Simulate payment processing
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      
      toast({
        title: "Payment Successful",
        description: `You have successfully enrolled in ${course.title}`,
      });
    }, 2000);
  };

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[300px] text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Payment Successful!</h2>
          <p className="text-muted-foreground mb-6">
            Thank you for your purchase. You are now enrolled in {course.title}.
          </p>
          <Button onClick={onCancel}>
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Details</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="font-medium">{course.title}</p>
              <p className="text-sm text-muted-foreground">
                {course.days ? course.days.length : 0} days • WhatsApp delivery
              </p>
            </div>
            <p className="text-xl font-bold">${course.price || "0.00"}</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-holder">Cardholder Name</Label>
              <Input
                id="card-holder"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="card-number">Card Number</Label>
              <div className="relative">
                <Input
                  id="card-number"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  maxLength={19}
                />
                <CreditCard className="h-4 w-4 absolute right-3 top-3 text-muted-foreground" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date</Label>
                <Input
                  id="expiry"
                  placeholder="MM/YY"
                  value={expiry}
                  onChange={handleExpiryChange}
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  placeholder="123"
                  value={cvc}
                  onChange={handleCvcChange}
                  maxLength={4}
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Processing..." : `Pay $${course.price || "0.00"}`}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default StripeCheckout;
