'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { 
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
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[hsl(224,40%,8%)] p-1.5 flex items-center justify-center ring-1 ring-white/10">
              <img
                src="https://res.cloudinary.com/dsijcu1om/image/upload/v1772089694/2_en3tei.png"
                alt="Jackisa Office logo"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">Jackisa Office</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl hover:bg-muted/50">
              Sign In
            </Link>
            <Button asChild className="shadow-glow-primary">
              <Link href="/auth/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-30" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36">
          <div className="text-center space-y-8 max-w-4xl mx-auto mb-16 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.08] border border-primary/10 text-primary text-xs font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Enterprise Operations Platform
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-foreground text-balance tracking-tight leading-[1.08]">
              The operating system
              <br />
              <span className="gradient-text">for modern teams</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground text-balance max-w-2xl mx-auto leading-relaxed">
              Manage HR, payroll, accounting, sales, education, and legal workflows from one beautifully designed dashboard.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <Button size="lg" asChild className="shadow-glow-primary">
                <Link href="/auth/register">
                  Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#features">Explore Features</Link>
              </Button>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative rounded-2xl border border-border/50 bg-[hsl(224,40%,8%)] overflow-hidden shadow-elevated">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
            <div className="relative flex flex-col md:flex-row items-center justify-center gap-10 h-[380px] px-8 py-12">
              <div className="w-36 h-36 md:w-44 md:h-44 rounded-3xl bg-white/[0.05] flex items-center justify-center ring-1 ring-white/10 backdrop-blur-sm">
                <img
                  src="https://res.cloudinary.com/dsijcu1om/image/upload/v1772089958/jackisa.com_logo_cbm52w.png"
                  alt="Jackisa Office platform"
                  className="w-28 h-28 md:w-36 md:h-36 object-contain"
                />
              </div>
              <div className="max-w-xl text-center md:text-left">
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4 tracking-tight">One platform, every workflow</h3>
                <p className="text-white/60 text-sm md:text-base leading-relaxed">
                  Jackisa Office centralizes people operations, finance, learning, and growth into one connected workspace so your teams can collaborate faster, stay compliant, and make better decisions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary mb-3 tracking-wide uppercase">Capabilities</p>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-5 tracking-tight">Built for every department</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Everything you need to manage your organization, beautifully integrated.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
          {[
            {
              icon: DollarSign,
              title: 'Accounting & Finance',
              description: 'Invoices, expenses, VAT, bookkeeping, and comprehensive financial management',
              gradient: 'from-emerald-500/10 to-emerald-500/5',
              iconBg: 'bg-emerald-500/10',
              iconColor: 'text-emerald-600',
            },
            {
              icon: Users,
              title: 'HR & Payroll',
              description: 'Employee management, PAYE tax calculations, attendance, and performance reviews',
              gradient: 'from-blue-500/10 to-blue-500/5',
              iconBg: 'bg-blue-500/10',
              iconColor: 'text-blue-600',
            },
            {
              icon: BookOpen,
              title: 'Education Management',
              description: 'Module management, student grades, coursework, and lecture scheduling',
              gradient: 'from-violet-500/10 to-violet-500/5',
              iconBg: 'bg-violet-500/10',
              iconColor: 'text-violet-600',
            },
            {
              icon: BarChart3,
              title: 'Sales & Marketing',
              description: 'Sales orders, commissions, and affiliate program management',
              gradient: 'from-amber-500/10 to-amber-500/5',
              iconBg: 'bg-amber-500/10',
              iconColor: 'text-amber-600',
            },
            {
              icon: Shield,
              title: 'Legal Documents',
              description: 'Auto-generate employment contracts and legal documents with ease',
              gradient: 'from-rose-500/10 to-rose-500/5',
              iconBg: 'bg-rose-500/10',
              iconColor: 'text-rose-600',
            },
            {
              icon: Check,
              title: 'Multi-Tenant Platform',
              description: 'Secure data isolation with role-based access control for teams',
              gradient: 'from-cyan-500/10 to-cyan-500/5',
              iconBg: 'bg-cyan-500/10',
              iconColor: 'text-cyan-600',
            },
          ].map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="group p-6 rounded-2xl border border-border/50 bg-card hover:shadow-elevated hover:border-border transition-all duration-300 hover-lift">
                <div className={`w-12 h-12 rounded-2xl ${feature.iconBg} flex items-center justify-center mb-5`}>
                  <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary mb-3 tracking-wide uppercase">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-5 tracking-tight">Simple, transparent pricing</h2>
          <p className="text-lg text-muted-foreground">Choose the plan that scales with your team</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto stagger-children">
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
              className={`p-8 rounded-2xl border transition-all duration-300 ${
                plan.featured
                  ? 'border-primary/30 bg-card shadow-elevated relative'
                  : 'border-border/50 bg-card hover:shadow-elevated hover:border-border'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-primary text-white text-xs font-semibold shadow-glow-primary">
                  <Star className="w-3 h-3" /> Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-foreground mb-1">{plan.name}</h3>
              <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground tracking-tight">{plan.price}</span>
                <span className="text-muted-foreground ml-1 text-sm">{plan.period}</span>
                <p className="text-xs text-muted-foreground/60 mt-1.5">or {plan.yearlyPrice}</p>
              </div>
              <Button className="w-full mb-8" asChild variant={plan.featured ? 'default' : 'outline'}>
                <Link href="/auth/register">Get Started</Link>
              </Button>
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-[hsl(224,40%,8%)]" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative p-12 md:p-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 tracking-tight">Ready to transform your business?</h2>
            <p className="text-lg text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed">
              Join hundreds of companies using Jackisa Office to streamline their operations and scale faster.
            </p>
            <Button size="lg" asChild className="bg-white text-[hsl(224,40%,8%)] hover:bg-white/90 shadow-lg">
              <Link href="/auth/register">Start Your Free Trial Today</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 rounded-lg bg-[hsl(224,40%,8%)] p-1.5 flex items-center justify-center">
                  <img
                    src="https://res.cloudinary.com/dsijcu1om/image/upload/v1772089694/2_en3tei.png"
                    alt="Jackisa Office logo"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="font-bold text-foreground">Jackisa Office</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">Professional office management for modern companies</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li><Link href="#features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Company</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/40 pt-8 text-center text-sm text-muted-foreground/60">
            <p>&copy; 2024 Jackisa Office, a product of Jackisa OPC. All Rights Reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
