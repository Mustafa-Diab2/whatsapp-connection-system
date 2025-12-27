import { render, screen, fireEvent } from '@testing-library/react'
import LoginPage from '../app/login/page'
import '@testing-library/jest-dom'

// Mock useRouter and useSearchParams
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
    }),
    useSearchParams: () => ({
        get: jest.fn(),
    }),
}))

describe('LoginPage', () => {
    it('renders login form by default', () => {
        render(<LoginPage />)

        // Check for main elements
        expect(screen.getByText('واتساب CRM')).toBeInTheDocument()
        // Check for buttons (Tab and Submit)
        const buttons = screen.getAllByText('تسجيل الدخول', { selector: 'button' })
        expect(buttons).toHaveLength(2)

        // Check inputs
        expect(screen.getByLabelText('البريد الإلكتروني')).toBeInTheDocument()
        expect(screen.getByLabelText('كلمة المرور')).toBeInTheDocument()
    })

    it('switches to register form', () => {
        render(<LoginPage />)

        // Click on create account tab
        fireEvent.click(screen.getByText('حساب جديد'))

        // Check for extra fields
        expect(screen.getByText('تأكيد كلمة المرور')).toBeInTheDocument()
        expect(screen.getByText('الاسم الكامل')).toBeInTheDocument()
    })
})
