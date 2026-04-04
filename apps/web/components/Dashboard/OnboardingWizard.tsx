"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ArrowRight, MessageSquare, Package, Send, Bot } from "lucide-react";
import Link from "next/link";

interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    icon: any;
    link: string;
    isCompleted: boolean;
}

export default function OnboardingWizard({ stats, erpStats }: { stats: any, erpStats: any }) {
    const [steps, setSteps] = useState<OnboardingStep[]>([]);
    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
        const onboardingSteps: OnboardingStep[] = [
            {
                id: "whatsapp",
                title: "ربط رقم الواتساب",
                description: "قم بمسح كود QR لتتمكن من إرسال واستقبال الرسائل آلياً.",
                icon: MessageSquare,
                link: "/whatsapp-connect",
                isCompleted: stats?.waConnected || false
            },
            {
                id: "products",
                title: "إضافة المنتجات",
                description: "أضف سلعك وخدماتك لتتمكن من إنشاء فواتير وعروض سعر.",
                icon: Package,
                link: "/inventory",
                isCompleted: erpStats?.totalProducts > 0
            },
            {
                id: "bot",
                title: "تفعيل الذكاء الاصطناعي",
                description: "قم بإعداد تعليمات البوت للرد على استفسارات العملاء 24/7.",
                icon: Bot,
                link: "/bot",
                isCompleted: stats?.botEnabled || false
            },
            {
                id: "campaign",
                title: "إطلاق أول حملة",
                description: "أرسل رسالة ترحيبية أو عرضاً خاصاً لجميع عملائك بضغطة زر.",
                icon: Send,
                link: "/campaigns",
                isCompleted: stats?.totalCampaigns > 0
            }
        ];
        setSteps(onboardingSteps);
        
        // Auto-close if all completed
        if (onboardingSteps.every(s => s.isCompleted)) {
            setIsOpen(false);
        }
    }, [stats, erpStats]);

    if (!isOpen) return null;

    const completedCount = steps.filter(s => s.isCompleted).length;
    const progress = (completedCount / steps.length) * 100;

    return (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[3rem] p-8 text-white shadow-2xl relative overflow-hidden mb-10 border border-slate-700">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-blue/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div>
                        <h2 className="text-2xl font-black mb-2 flex items-center gap-3">
                            🚀 لنبدأ رحلة النجاح
                            <span className="text-xs bg-brand-blue px-3 py-1 rounded-full font-bold uppercase tracking-widest text-white/90">دليل البداية</span>
                        </h2>
                        <p className="text-slate-400 text-sm font-medium">أكمل هذه الخطوات البسيطة لتفعيل كامل طاقة النظام لمشروعك.</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl font-black text-brand-blue">{progress}%</span>
                            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-brand-blue transition-all duration-1000" 
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">إنجاز الخطوات التشغيلية</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {steps.map((step) => (
                        <Link 
                            key={step.id} 
                            href={step.link}
                            className={`p-6 rounded-[2rem] border transition-all group ${
                                step.isCompleted 
                                ? 'bg-slate-800/50 border-emerald-500/30' 
                                : 'bg-white/5 border-white/10 hover:border-brand-blue hover:bg-white/10'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-2xl ${step.isCompleted ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/10 text-white'}`}>
                                    <step.icon className="w-5 h-5" />
                                </div>
                                {step.isCompleted ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : (
                                    <Circle className="w-5 h-5 text-slate-600 group-hover:text-brand-blue" />
                                )}
                            </div>
                            <h3 className="font-bold text-sm mb-1">{step.title}</h3>
                            <p className="text-[10px] text-slate-500 leading-relaxed mb-4">{step.description}</p>
                            
                            {!step.isCompleted && (
                                <div className="flex items-center gap-2 text-[10px] font-black text-brand-blue uppercase tracking-widest group-hover:gap-3 transition-all">
                                    ابدأ الآن <ArrowRight className="w-3 h-3" />
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            </div>
            
            <button 
                onClick={() => setIsOpen(false)}
                className="absolute top-6 left-6 text-slate-500 hover:text-white transition-colors"
            >
                ✕
            </button>
        </div>
    );
}
