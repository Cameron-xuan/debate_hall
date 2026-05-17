import { createContext, useContext, useState, type ReactNode } from 'react'
import t, { type Lang, type Translations } from './translations'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  T: Translations
}

const LangContext = createContext<LangCtx>({
  lang: 'zh',
  setLang: () => {},
  T: t.zh,
})

export function LangProvider({ children }: { children: ReactNode }) {
  const saved = (localStorage.getItem('lang') ?? 'zh') as Lang
  const [lang, setLangState] = useState<Lang>(saved)

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('lang', l)
  }

  return (
    <LangContext.Provider value={{ lang, setLang, T: t[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
