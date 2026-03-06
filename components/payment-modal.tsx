'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Banknote, Smartphone, CreditCard, X, CheckCircle, AlertCircle,
  Loader2, ArrowRight, Shield, Landmark, Phone,
} from 'lucide-react'
import { initiatePayment, checkPaymentStatus, formatMsisdn } from '@/lib/payment-gateway'
import type { PaymentDirection, PaymentModule, PaymentMethodType } from '@/lib/payment-gateway'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: (paymentId: string, method: PaymentMethodType) => void
  onFailed?: (message: string) => void
  companyId: string
  userId?: string
  direction: PaymentDirection
  module: PaymentModule
  moduleReferenceId?: string
  moduleReferenceType?: string
  amount: number
  currency?: string
  title?: string
  description?: string
  recipientPhone?: string
  metadata?: Record<string, any>
}

type Step = 'choose' | 'phone' | 'cash' | 'processing' | 'success' | 'failed'

export default function PaymentModal({
  open, onClose, onSuccess, onFailed,
  companyId, userId, direction, module,
  moduleReferenceId, moduleReferenceType,
  amount, currency = 'UGX', title, description,
  recipientPhone, metadata,
}: PaymentModalProps) {
  const [step, setStep] = useState<Step>('choose')
  const [method, setMethod] = useState<PaymentMethodType>('jackisa_pay')
  const [phone, setPhone] = useState(recipientPhone || '')
  const [cashTendered, setCashTendered] = useState('')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [pollCount, setPollCount] = useState(0)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose')
      setMethod('jackisa_pay')
      setPhone(recipientPhone || '')
      setCashTendered('')
      setPaymentId(null)
      setStatusMsg('')
      setPollCount(0)
    }
  }, [open, recipientPhone])

  // Poll for payment status
  useEffect(() => {
    if (step !== 'processing' || !paymentId) return
    const interval = pollCount < 6 ? 10000 : 30000 // 10s first minute, then 30s
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/payments/status?payment_id=${paymentId}`)
        const data = await res.json()
        if (data.status === 'success') {
          setStep('success')
          setStatusMsg('Payment confirmed!')
          onSuccess?.(paymentId, method)
        } else if (data.status === 'failed' || data.status === 'timed_out') {
          setStep('failed')
          setStatusMsg(data.message || 'Payment failed')
          onFailed?.(data.message)
        } else {
          setPollCount((c) => c + 1)
          setStatusMsg(data.message || 'Waiting for confirmation...')
        }
      } catch {
        setPollCount((c) => c + 1)
      }
    }, interval)
    return () => clearTimeout(timer)
  }, [step, paymentId, pollCount, method, onSuccess, onFailed])

  const handleJackisaPay = () => {
    setMethod('jackisa_pay')
    if (direction === 'disbursement' && recipientPhone) {
      processPayment('jackisa_pay', recipientPhone)
    } else {
      setStep('phone')
    }
  }

  const handleCash = () => {
    setMethod('cash')
    setStep('cash')
  }

  const handleCard = () => {
    setMethod('visa_mastercard')
    processPayment('visa_mastercard')
  }

  const processPayment = async (chosenMethod: PaymentMethodType, phoneNumber?: string) => {
    setStep('processing')
    setStatusMsg(chosenMethod === 'cash' ? 'Recording cash payment...' : 'Sending payment request...')

    const result = await initiatePayment({
      companyId,
      module,
      moduleReferenceId,
      moduleReferenceType,
      direction,
      paymentMethod: chosenMethod,
      msisdn: phoneNumber || phone || undefined,
      currency,
      amount,
      description,
      metadata,
      initiatedBy: userId,
      cashTendered: chosenMethod === 'cash' ? Number(cashTendered) || amount : undefined,
    })

    setPaymentId(result.paymentId)

    if (chosenMethod === 'cash' || chosenMethod === 'internal_transfer') {
      if (result.success) {
        setStep('success')
        setStatusMsg(`Cash payment recorded. ${result.changeGiven && result.changeGiven > 0 ? `Change: ${currency} ${result.changeGiven.toLocaleString()}` : ''}`)
        onSuccess?.(result.paymentId, chosenMethod)
      } else {
        setStep('failed')
        setStatusMsg(result.message)
        onFailed?.(result.message)
      }
      return
    }

    if (chosenMethod === 'visa_mastercard' && result.paymentUrl) {
      window.open(result.paymentUrl, '_blank')
      setStatusMsg('Card payment page opened. Complete payment there.')
      return
    }

    if (result.success) {
      setStatusMsg(result.message)
    } else {
      setStep('failed')
      setStatusMsg(result.message)
      onFailed?.(result.message)
    }
  }

  const formatAmount = (n: number) => `${currency} ${n.toLocaleString()}`

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <Card className="w-full max-w-md mx-4 overflow-hidden shadow-2xl border-0">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary/[0.08] via-blue-500/[0.05] to-emerald-500/[0.06] p-5 border-b border-border/30">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-sm">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">{title || (direction === 'collection' ? 'Collect Payment' : 'Send Payment')}</h2>
              <p className="text-xs text-muted-foreground">{description || `${direction === 'collection' ? 'Receive' : 'Send'} ${formatAmount(amount)}`}</p>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground tracking-tight">{formatAmount(amount)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* ── Step: Choose Method ── */}
          {step === 'choose' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Select payment method</p>

              {/* Jackisa Pay (Mobile Money) */}
              <button
                onClick={handleJackisaPay}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground">Jackisa Pay</p>
                  <p className="text-[11px] text-muted-foreground">MTN Mobile Money · Airtel Money</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </button>

              {/* Cash */}
              <button
                onClick={handleCash}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-amber-300 hover:bg-amber-50/30 transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Banknote className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground">Cash</p>
                  <p className="text-[11px] text-muted-foreground">Record a physical cash transaction</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-amber-500 transition-colors" />
              </button>

              {/* Card (collections only) */}
              {direction === 'collection' && (
                <button
                  onClick={handleCard}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-foreground">Visa / Mastercard</p>
                    <p className="text-[11px] text-muted-foreground">Secure card payment via Relworx</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-blue-500 transition-colors" />
                </button>
              )}

              <div className="flex items-center gap-1.5 justify-center pt-2">
                <Shield className="w-3 h-3 text-muted-foreground/30" />
                <p className="text-[10px] text-muted-foreground/40">Payments secured by Jackisa &amp; Relworx</p>
              </div>
            </div>
          )}

          {/* ── Step: Phone Input ── */}
          {step === 'phone' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-primary hover:underline">&larr; Back</button>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  <Phone className="w-3 h-3 inline mr-1" />
                  {direction === 'collection' ? 'Payer\'s phone number' : 'Recipient\'s phone number'}
                </label>
                <Input
                  type="tel"
                  placeholder="e.g. 0701234567 or +256701234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  {direction === 'collection'
                    ? 'A payment prompt will be sent to this number'
                    : 'Money will be sent to this mobile money number'}
                </p>
              </div>
              <Button
                className="w-full"
                disabled={!phone || phone.replace(/\D/g, '').length < 9}
                onClick={() => processPayment('jackisa_pay', phone)}
              >
                <Smartphone className="w-4 h-4 mr-1.5" />
                {direction === 'collection' ? 'Send Payment Prompt' : `Send ${formatAmount(amount)}`}
              </Button>
            </div>
          )}

          {/* ── Step: Cash ── */}
          {step === 'cash' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-primary hover:underline">&larr; Back</button>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  <Banknote className="w-3 h-3 inline mr-1" />
                  Cash tendered
                </label>
                <Input
                  type="number"
                  placeholder={amount.toString()}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="text-sm font-mono"
                />
                {Number(cashTendered) > amount && (
                  <p className="text-[10px] text-emerald-600 mt-1 font-medium">
                    Change: {formatAmount(Number(cashTendered) - amount)}
                  </p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => processPayment('cash')}
              >
                <Banknote className="w-4 h-4 mr-1.5" />
                Record Cash Payment
              </Button>
            </div>
          )}

          {/* ── Step: Processing ── */}
          {step === 'processing' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
              <p className="text-sm font-semibold text-foreground">Processing Payment</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">{statusMsg}</p>
              {method !== 'cash' && (
                <p className="text-[10px] text-muted-foreground/40 mt-4">
                  Do not close this window. Checking every {pollCount < 6 ? '10' : '30'} seconds...
                </p>
              )}
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-base font-bold text-foreground">Payment Successful</p>
              <p className="text-xs text-muted-foreground mt-1.5">{statusMsg}</p>
              <p className="text-lg font-bold text-emerald-600 mt-3">{formatAmount(amount)}</p>
              <Button className="mt-5" onClick={onClose}>Done</Button>
            </div>
          )}

          {/* ── Step: Failed ── */}
          {step === 'failed' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-base font-bold text-foreground">Payment Failed</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">{statusMsg}</p>
              <div className="flex gap-2 justify-center mt-5">
                <Button variant="outline" onClick={() => setStep('choose')}>Try Again</Button>
                <Button variant="outline" onClick={onClose}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
