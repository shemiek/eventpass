/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12172B',
        navy: '#1C2544',
        gold: '#F2A93B',
        stub: '#E4572E',
        paper: '#F4F1EC',
        mist: '#8C93AC'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      backgroundImage: {
        perforate:
          'radial-gradient(circle, transparent 6px, #F4F1EC 6.5px) 0 0/16px 16px repeat-x'
      }
    }
  },
  plugins: []
}
