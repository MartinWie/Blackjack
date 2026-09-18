/** @type {import('tailwindcss').Config} */
module.exports = {
    // Our sources only: `static/vendor/` holds anime.js and the compiled engine, and
    // scanning 300 kB of minified bundle for class names finds nothing but costs a
    // second of every build.
    content: ["./src/jvmMain/kotlin/**/*.kt", "./src/jvmMain/resources/static/*.js"],
    theme: {
        extend: {
            colors: {
                felt: {DEFAULT: '#0B3B2E', dark: '#072A20', light: '#12513E'},
                gold: '#E9C46A',
                chalk: '#F5F1E6',
                chip: {red: '#C1443A', blue: '#2F6FB2', green: '#2E8B57', black: '#1B1B1B'},
            },
            fontFamily: {
                display: ['Georgia', 'ui-serif', 'serif'],
                sans: ['ui-rounded', 'SF Pro Rounded', 'system-ui', 'sans-serif'],
            },
            borderRadius: {sm: '10px', md: '16px', lg: '22px', pill: '999px'},
        },
    },
    plugins: [require('daisyui')],
    daisyui: {
        themes: [{
            casino: {
                'primary': '#E9C46A',
                'primary-content': '#072A20',
                'secondary': '#12513E',
                'secondary-content': '#F5F1E6',
                'accent': '#C1443A',
                'accent-content': '#F5F1E6',
                'neutral': '#072A20',
                'neutral-content': '#F5F1E6',
                'base-100': '#0B3B2E',
                'base-200': '#072A20',
                'base-300': '#12513E',
                'base-content': '#F5F1E6',
                'info': '#2F6FB2',
                'success': '#2E8B57',
                'warning': '#E9C46A',
                'error': '#C1443A',
                '--rounded-box': '22px',
                '--rounded-btn': '999px',
            },
        }],
    },
}
