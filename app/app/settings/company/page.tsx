'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle } from 'lucide-react'
import type { Company } from '@/types'

export default function CompanySettings() {
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: employeeData } = await supabase
          .from('employees')
          .select('company_id')
          .eq('user_id', session.user.id)
          .single()

        if (employeeData) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', employeeData.company_id)
            .single()

          if (companyData) {
            setCompany(companyData)
          }
        }
      } catch (error) {
        console.error('Failed to load company:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCompany()
  }, [])

  const handleSave = async () => {
    if (!company) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: company.name,
          email: company.email,
          phone: company.phone,
          address: company.address,
          city: company.city,
          industry: company.industry,
        })
        .eq('id', company.id)

      if (error) {
        setMessage({ type: 'error', text: 'Failed to save settings' })
        return
      }

      setMessage({ type: 'success', text: 'Settings saved successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded mb-4 w-1/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Company Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your company information and details</p>
      </div>

      {message && (
        <div className={`mb-6 flex items-center gap-3 rounded-xl p-4 ${
          message.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-600 border border-red-500/20'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {company && (
        <Card className="overflow-hidden">
          <div className="p-6 space-y-6">
            {/* General Information */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">General Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Company Name
                  </label>
                  <Input
                    id="name"
                    value={company.name}
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    placeholder="Company Name"
                  />
                </div>
                <div>
                  <label htmlFor="industry" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Industry
                  </label>
                  <Input
                    id="industry"
                    value={company.industry || ''}
                    onChange={(e) => setCompany({ ...company, industry: e.target.value })}
                    placeholder="e.g. Technology, Finance"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border/30" />

            {/* Contact Details */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Contact Details</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    placeholder="company@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Phone Number
                  </label>
                  <Input
                    id="phone"
                    value={company.phone || ''}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    placeholder="+256 ..."
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border/30" />

            {/* Location */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Location</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="address" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Street Address
                  </label>
                  <Input
                    id="address"
                    value={company.address || ''}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                    placeholder="Street address"
                  />
                </div>
                <div>
                  <label htmlFor="city" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    City
                  </label>
                  <Input
                    id="city"
                    value={company.city || ''}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-muted/20 border-t border-border/30 flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline">Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
