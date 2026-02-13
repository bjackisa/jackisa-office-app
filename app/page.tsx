'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { 
  Briefcase, 
  Users, 
  DollarSign, 
  BarChart3, 
  BookOpen,
  ArrowRight,
  Check,
  Star,
  Shield
} from 'lucide-react'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/app')
      }
    }
    checkAuth()
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/5">
      {/* Navigation */}
      <nav className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Jackisa Office</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-foreground hover:text-primary transition-colors">
              Sign In
            </Link>
            <Button asChild>
              <Link href="/auth/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="text-center space-y-6 max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground text-balance">
            Professional Office Management for Modern Companies
          </h1>
          <p className="text-lg text-muted-foreground text-balance">
            Jackisa Office is a comprehensive platform that handles everything from employee management and accounting to payroll, HR, and education. Streamline your operations and grow your business with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild>
              <Link href="/auth/register">
                Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </div>

        {/* Hero Image */}
        <div className="relative rounded-xl border border-border bg-card/50 backdrop-blur overflow-hidden h-96 md:h-96">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Briefcase className="w-16 h-16 text-primary/40 mx-auto mb-4" />
              <p className="text-muted-foreground">Dashboard preview will be here</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Powerful Features for Every Department</h2>
          <p className="text-lg text-muted-foreground">Everything you need to manage your organization efficiently</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: DollarSign,
              title: 'Accounting & Finance',
              description: 'Invoices, expenses, VAT, bookkeeping, and comprehensive financial management'
            },
            {
              icon: Users,
              title: 'HR & Payroll',
              description: 'Employee management, PAYE tax calculations, attendance, and performance reviews'
            },
            {
              icon: BookOpen,
              title: 'Education Management',
              description: 'Module management, student grades, coursework, and lecture scheduling'
            },
            {
              icon: BarChart3,
              title: 'Sales & Marketing',
              description: 'Sales orders, commissions, and affiliate program management'
            },
            {
              icon: Shield,
              title: 'Legal Documents',
              description: 'Auto-generate employment contracts and legal documents with ease'
            },
            {
              icon: Check,
              title: 'Multi-Tenant Platform',
              description: 'Secure data isolation with role-based access control for teams'
            },
          ].map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="p-6 rounded-lg border border-border bg-card hover:shadow-lg transition-shadow">
                <Icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-muted-foreground">Choose the plan that fits your company's needs</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              name: 'Basic',
              price: '$5',
              period: 'per month',
              yearlyPrice: '$45/year',
              description: 'Perfect for small teams',
              features: [
                'Up to 10 employees',
                '5 GB storage',
                'Basic accounting tools',
                'HR management',
                'Email support'
              ]
            },
            {
              name: 'Pro',
              price: '$15',
              period: 'per month',
              yearlyPrice: '$120/year',
              description: 'For growing companies',
              features: [
                'Up to 100 employees',
                '50 GB storage',
                'All accounting tools',
                'Advanced HR & Payroll',
                'Education module',
                'Priority support'
              ],
              featured: true
            },
            {
              name: 'Platinum',
              price: '$25',
              period: 'per month',
              yearlyPrice: '$200/year',
              description: 'For enterprises',
              features: [
                'Unlimited employees',
                '500 GB storage',
                'All features included',
                'Advanced analytics',
                'API access',
                '24/7 dedicated support',
                'Custom integrations'
              ]
            }
          ].map((plan) => (
            <div
              key={plan.name}
              className={`p-8 rounded-lg border transition-all ${
                plan.featured
                  ? 'border-primary bg-card shadow-lg scale-105'
                  : 'border-border bg-card hover:shadow-lg'
              }`}
            >
              {plan.featured && (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
                  <Star className="w-3 h-3" /> Most Popular
                </div>
              )}
              <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
              <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>
              <div className="mb-6">
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground ml-2">{plan.period}</span>
                <p className="text-xs text-muted-foreground mt-2">or {plan.yearlyPrice}</p>
              </div>
              <Button className="w-full mb-6" asChild variant={plan.featured ? 'default' : 'outline'}>
                <Link href="/auth/register">Get Started</Link>
              </Button>
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-12 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to Transform Your Business?</h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join hundreds of companies using Jackisa Office to streamline their operations
          </p>
          <Button size="lg" asChild>
            <Link href="/auth/register">Start Your Free Trial Today</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background/50 backdrop-blur py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-foreground mb-4">Jackisa Office</h4>
              <p className="text-sm text-muted-foreground">Professional office management for modern companies</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground">Features</Link></li>
                <li><Link href="#" className="hover:text-foreground">Pricing</Link></li>
                <li><Link href="#" className="hover:text-foreground">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground">About</Link></li>
                <li><Link href="#" className="hover:text-foreground">Blog</Link></li>
                <li><Link href="#" className="hover:text-foreground">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground">Terms</Link></li>
                <li><Link href="#" className="hover:text-foreground">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 Jackisa Office. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
