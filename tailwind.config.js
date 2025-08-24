// tailwind.config.js
module.exports = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'Apple SD Gothic Neo', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
            },
            boxShadow: {
                'soft-2xl': '0 20px 60px -15px rgba(0,0,0,0.45)',
            },
            animation: {
                'float-slow': 'float 12s ease-in-out infinite',
                'float-slower': 'float 18s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0) translateX(0)' },
                    '50%': { transform: 'translateY(-14px) translateX(6px)' },
                },
            },
        },
    },
    plugins: [],
};
