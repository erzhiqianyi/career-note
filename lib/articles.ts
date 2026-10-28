import { articleLocales, type ArticleLocale, type ArticleText } from './agent-article-seed';

export { articleLocales, type ArticleLocale, type ArticleText };
export type ArticleCategory = 'start' | 'prepare' | 'connect';
/** Chinese is the source text; `translations` holds optional Japanese and English versions. */
export type Article = ArticleText & {
  slug: string; category: ArticleCategory; status: 'draft' | 'published';
  revision: number; updatedAt: string;
  translations: Partial<Record<ArticleLocale, ArticleText>>;
};
export type ArticleLanguage = 'zh-CN' | ArticleLocale;

export const isArticleLocale = (value: unknown): value is ArticleLocale =>
  articleLocales.includes(value as ArticleLocale);

/** Which language a reader asking for `requested` gets: its translation when one exists, Chinese otherwise. */
export function articleLanguage(article: Pick<Article, 'translations'>, requested: string | null | undefined): ArticleLanguage {
  const lang = requested?.toLowerCase().startsWith('ja') ? 'ja' : requested?.toLowerCase().startsWith('en') ? 'en' : null;
  return lang && article.translations[lang] ? lang : 'zh-CN';
}
export function articleText(article: Article, lang: ArticleLanguage): ArticleText {
  return lang === 'zh-CN' ? article : article.translations[lang] ?? article;
}
/** Languages the article is readable in, Chinese first. */
export const articleLanguages = (article: Pick<Article, 'translations'>): ArticleLanguage[] =>
  ['zh-CN', ...articleLocales.filter(lang => article.translations[lang])];
