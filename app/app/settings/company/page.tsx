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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Company Settings</h1>
        <p className="text-muted-foreground">Manage your company information</p>
      </div>

      {message && (
        <div className={`mb-6 flex items-gap-3 rounded-lg p-4 ${
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-700' 
            : 'bg-red-500/10 text-red-700'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {company && (
        <Card className="p-6 border border-border space-y-6">
          {/* Company Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
              Company Name
            </label>
            <Input
              id="name"
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
              placeholder="Company Name"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={company.email}
              onChange={(e) => setCompany({ ...company, email: e.target.value })}
              placeholder="company@example.com"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
              Phone
            </label>
            <Input
              id="phone"
              value={company.phone || ''}
              onChange={(e) => setCompany({ ...company, phone: e.target.value })}
              placeholder="+256 ..."
            />
          </div>

          {/* Address */}
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-foreground mb-2">
              Address
            </label>
            <Input
              id="address"
              value={company.address || ''}
              onChange={(e) => setCompany({ ...company, address: e.target.value })}
              placeholder="Street address"
            />
          </div>

          {/* City */}
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-foreground mb-2">
              City
            </label>
            <Input
              id="city"
              value={company.city || ''}
              onChange={(e) => setCompany({ ...company, city: e.target.value })}
              placeholder="City"
            />
          </div>

          {/* Industry */}
          <div>
            <label htmlFor="industry" className="block text-sm font-medium text-foreground mb-2">
              Industry
            </label>
            <Input
              id="industry"
              value={company.industry || ''}
              onChange={(e) => setCompany({ ...company, industry: e.target.value })}
              placeholder="Industry"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
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
