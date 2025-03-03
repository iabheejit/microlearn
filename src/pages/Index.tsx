
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { ArrowRight, BookOpen, Check, ChevronRight, MessageCircle, Sparkles, Users } from "lucide-react";

const Index = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-32 pb-20 md:pt-44 md:pb-32 px-4">
          <div className="container mx-auto text-center max-w-4xl">
            <div className="inline-block mb-4 px-3 py-1 bg-primary/10 rounded-full">
              <span className="text-sm font-medium text-primary">Enterprise Learning Reimagined</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-fade-in">
              Learning at the speed of <span className="text-primary">WhatsApp</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.1s" }}>
              Deliver bite-sized learning content directly to your employees' phones. 
              Train smarter with AI-powered microlearning that fits into your team's workflow.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <Button size="lg" asChild>
                <Link to={ROUTES.LOGIN}>
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="#features">
                  Learn More <ChevronRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-muted/50" id="features">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">All-in-one Learning Platform</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Everything you need to train your team effectively, all in one place
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-background rounded-xl p-6 shadow-sm border border-border hover-scale">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">WhatsApp Delivery</h3>
                <p className="text-muted-foreground">
                  Deliver learning content directly to employees' phones via WhatsApp, 
                  with support for text, images, video, and interactive elements.
                </p>
              </div>

              <div className="bg-background rounded-xl p-6 shadow-sm border border-border hover-scale">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Intuitive Course Builder</h3>
                <p className="text-muted-foreground">
                  Create engaging microlearning courses with our drag-and-drop editor. 
                  Schedule content delivery and track progress automatically.
                </p>
              </div>

              <div className="bg-background rounded-xl p-6 shadow-sm border border-border hover-scale">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">AI-Powered Content</h3>
                <p className="text-muted-foreground">
                  Generate personalized learning content with our AI tools. 
                  Adapt to each learner's pace and preferences for maximum retention.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Get your team up and running with Ekatra in minutes
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">Create Courses</h3>
                <p className="text-muted-foreground">
                  Design bite-sized learning modules using our templates or AI assistant.
                </p>
              </div>

              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">Add Learners</h3>
                <p className="text-muted-foreground">
                  Import your team via CSV or integrate with your HR system.
                </p>
              </div>

              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">Launch & Track</h3>
                <p className="text-muted-foreground">
                  Deliver content via WhatsApp and monitor engagement in real-time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-20 bg-muted/50" id="testimonials">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Trusted by Teams Worldwide</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                See how organizations are transforming their learning programs
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="bg-background rounded-xl p-6 shadow-sm border border-border">
                <div className="flex items-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                    <span className="text-lg font-bold text-primary">A</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Alex Chen</h3>
                    <p className="text-sm text-muted-foreground">HR Director, Global Tech Corp</p>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  "Ekatra has transformed how we deliver training to our field staff. The WhatsApp integration means our team actually engages with the content, and the analytics help us identify knowledge gaps quickly."
                </p>
              </div>

              <div className="bg-background rounded-xl p-6 shadow-sm border border-border">
                <div className="flex items-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                    <span className="text-lg font-bold text-primary">S</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Sarah Johnson</h3>
                    <p className="text-sm text-muted-foreground">L&D Manager, Retail Chain</p>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  "We've seen a 78% increase in training completion rates since implementing Ekatra. The microlearning approach and delivery via WhatsApp has been a game-changer for our distributed workforce."
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20" id="pricing">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Choose the plan that's right for your organization
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="bg-background rounded-xl p-6 shadow-sm border border-border hover-scale">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-2">Starter</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Perfect for small teams
                  </p>
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">$199</span>
                    <span className="text-muted-foreground ml-1">/month</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Up to 100 learners</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>10 active courses</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Basic analytics</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Email support</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full">Get Started</Button>
              </div>

              <div className="bg-background rounded-xl p-6 shadow-lg border-2 border-primary relative hover-scale transform-gpu">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-2">Professional</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    For growing organizations
                  </p>
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">$499</span>
                    <span className="text-muted-foreground ml-1">/month</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Up to 500 learners</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Unlimited courses</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Advanced analytics</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>AI content generation</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Priority support</span>
                  </li>
                </ul>
                <Button className="w-full">Get Started</Button>
              </div>

              <div className="bg-background rounded-xl p-6 shadow-sm border border-border hover-scale">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-2">Enterprise</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    For large organizations
                  </p>
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">Custom</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Unlimited learners</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Unlimited courses</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Custom integrations</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>Dedicated account manager</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 text-primary mr-2" />
                    <span>99.9% SLA</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full">Contact Sales</Button>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary/5">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to transform your learning program?</h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join thousands of organizations using Ekatra to deliver effective, 
              engaging learning experiences at scale.
            </p>
            <Button size="lg" asChild>
              <Link to={ROUTES.LOGIN}>
                Get Started Today <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
