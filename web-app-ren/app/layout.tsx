import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'WakeUpBuddy - あなたを覚えている目覚まし',
    description: 'memU長期記憶を活用したパーソナルAI目覚ましアプリケーション',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'WakeUpBuddy',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ja">
            <body className="min-h-screen safe-area-top safe-area-bottom">
                {children}
            </body>
        </html>
    );
}
