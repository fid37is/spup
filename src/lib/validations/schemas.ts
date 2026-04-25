// src/lib/validations/schemas.ts
import { z } from 'zod'

export function toE164(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '')
  if (cleaned.startsWith('+234')) return cleaned
  if (cleaned.startsWith('0')) return '+234' + cleaned.slice(1)
  return '+234' + cleaned
}

function isAtLeast13(dob: string): boolean {
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 13
}

export const signupSchema = z.object({
  full_name: z.string().min(2,'Name must be at least 2 characters').max(60,'Max 60 characters').regex(/^[a-zA-Z\s'-]+$/,'Letters, spaces, hyphens and apostrophes only'),
  email: z.string().min(1,'Email is required').email('Enter a valid email address').toLowerCase(),
  date_of_birth: z.string().min(1,'Date of birth is required').refine(v=>!isNaN(Date.parse(v)),'Enter a valid date').refine(v=>isAtLeast13(v),'You must be at least 13 years old'),
  password: z.string().min(8,'At least 8 characters').regex(/[A-Z]/,'Must contain an uppercase letter').regex(/[0-9]/,'Must contain a number'),
  confirm_password: z.string(),
}).refine(d=>d.password===d.confirm_password,{ message:"Passwords don't match", path:['confirm_password'] })
export type SignupSchema = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().min(1,'Email is required').email('Enter a valid email address'),
  password: z.string().min(1,'Password is required'),
})
export type LoginSchema = z.infer<typeof loginSchema>

export const emailOtpSchema = z.object({
  token: z.string().length(6,'Code must be 6 digits').regex(/^\d{6}$/,'Numbers only'),
})
export type EmailOtpSchema = z.infer<typeof emailOtpSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().min(1,'Email is required').email('Enter a valid email address'),
})
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>

export const completeSocialProfileSchema = z.object({
  full_name: z.string().min(2,'At least 2 characters').max(60),
  date_of_birth: z.string().min(1,'Required').refine(v=>!isNaN(Date.parse(v)),'Invalid date').refine(v=>isAtLeast13(v),'Must be at least 13'),
})
export type CompleteSocialProfileSchema = z.infer<typeof completeSocialProfileSchema>

export const phoneSchema = z.object({
  phone: z.string().min(1,'Phone number is required').regex(/^(\+234|0)[789][01]\d{8}$/,'Enter a valid Nigerian phone number'),
})
export type PhoneSchema = z.infer<typeof phoneSchema>

export const profileSetupSchema = z.object({
  username: z.string().min(3,'At least 3 characters').max(20,'Max 20 characters').regex(/^[a-zA-Z0-9_]+$/,'Letters, numbers and underscores only').transform(v=>v.toLowerCase()),
  bio: z.string().max(160,'Max 160 characters').optional(),
})
export type ProfileSetupSchema = z.infer<typeof profileSetupSchema>

export const interestsSchema = z.object({
  interests: z.array(z.string()).min(3,'Select at least 3').max(10,'Max 10'),
})
export type InterestsSchema = z.infer<typeof interestsSchema>

const mediaItemSchema = z.object({
  url: z.string().url(),
  thumbnail_url: z.string().url().nullable().optional(),
  media_type: z.enum(['image', 'video']),
  width: z.number().optional(),
  height: z.number().optional(),
  duration_secs: z.number().nullable().optional(),
  size_bytes: z.number().optional(),
  cloudinary_id: z.string(),
})

export const createPostSchema = z.object({
  body: z.string().max(500,'Max 500 characters').optional(),
  media: z.array(mediaItemSchema).max(4).optional(),
  parent_post_id: z.string().uuid().optional(),
  quoted_post_id: z.string().uuid().optional(),
}).refine(d=>(d.body&&d.body.trim().length>0)||(d.media&&d.media.length>0),{ message:'Post must have text or media' })
export type CreatePostSchema = z.infer<typeof createPostSchema>

export const reportSchema = z.object({
  entity_id: z.string().uuid(),
  entity_type: z.enum(['post','user','comment']),
  reason: z.enum(['spam','harassment','hate_speech','misinformation','nudity','violence','other']),
  details: z.string().max(500).optional(),
})