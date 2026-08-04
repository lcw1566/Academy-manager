export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        seenit: {
          canvas: 'rgb(var(--seenit-color-canvas) / <alpha-value>)',
          surface: 'rgb(var(--seenit-color-surface) / <alpha-value>)',
          elevated: 'rgb(var(--seenit-color-elevated) / <alpha-value>)',
          control: 'rgb(var(--seenit-color-control) / <alpha-value>)',
          border: 'rgb(var(--seenit-color-border) / <alpha-value>)',
          'border-soft': 'rgb(var(--seenit-color-border-soft) / <alpha-value>)',
          ink: 'rgb(var(--seenit-color-ink) / <alpha-value>)',
          secondary: 'rgb(var(--seenit-color-secondary) / <alpha-value>)',
          muted: 'rgb(var(--seenit-color-muted) / <alpha-value>)',
          subtle: 'rgb(var(--seenit-color-subtle) / <alpha-value>)',
          brand: 'rgb(var(--seenit-color-brand) / <alpha-value>)',
          'brand-soft': 'rgb(var(--seenit-color-brand-soft) / <alpha-value>)',
          'brand-muted': 'rgb(var(--seenit-color-brand-muted) / <alpha-value>)',
          'success-soft': 'rgb(var(--seenit-color-success-soft) / <alpha-value>)',
          success: 'rgb(var(--seenit-color-success) / <alpha-value>)',
          'warning-soft': 'rgb(var(--seenit-color-warning-soft) / <alpha-value>)',
          warning: 'rgb(var(--seenit-color-warning) / <alpha-value>)',
          'danger-soft': 'rgb(var(--seenit-color-danger-soft) / <alpha-value>)',
          danger: 'rgb(var(--seenit-color-danger) / <alpha-value>)',
          'purple-soft': 'rgb(var(--seenit-color-purple-soft) / <alpha-value>)',
          purple: 'rgb(var(--seenit-color-purple) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
