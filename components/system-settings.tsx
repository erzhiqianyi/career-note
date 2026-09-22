'use client';
import { Check, RotateCcw } from 'lucide-react';
import { useAppearance, type Appearance } from './appearance-provider';
import { LanguageSwitcher, useLocale } from './locale-provider';
import { Switch } from './ui/switch';

const themes = [
  { value: 'blue', label: '经典蓝' },
  { value: 'forest', label: '森林绿' },
  { value: 'paper', label: '暖纸色' },
] as const;
const sizes = [
  { value: 100, label: '标准' },
  { value: 112.5, label: '舒适' },
  { value: 125, label: '大号' },
  { value: 137.5, label: '特大' },
] as const;
export default function SystemSettings() {
  const { t: tr } = useLocale();
  const { appearance, update, reset, saved } = useAppearance();
  return (
    <section className="settings-page" aria-label={tr('系统设置')}>
      <div className="settings-panel">
        <fieldset>
          <legend>{tr('主题')}</legend>
          <div className="theme-options">
            {themes.map((theme) => (
              <label className="theme-option" key={theme.value}>
                <input
                  type="radio"
                  name="theme"
                  value={theme.value}
                  checked={appearance.theme === theme.value}
                  onChange={() => update({ theme: theme.value })}
                />
                <span
                  className="theme-swatch"
                  data-palette={theme.value}
                  aria-hidden="true"
                >
                  <i />
                  <span>
                    <b />
                    <b />
                    <b />
                  </span>
                </span>
                <span className="theme-label">
                  {tr(theme.label)}
                  {appearance.theme === theme.value && (
                    <Check size={18} aria-hidden="true" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{tr('字体大小')}</legend>
          <div className="font-options">
            {sizes.map((size) => (
              <label key={size.value}>
                <input
                  type="radio"
                  name="font-size"
                  value={size.value}
                  checked={appearance.fontSize === size.value}
                  onChange={() =>
                    update({ fontSize: size.value as Appearance['fontSize'] })
                  }
                />
                <span>
                  {tr(size.label)}
                  <small>{size.value}%</small>
                </span>
              </label>
            ))}
          </div>
          <div className="settings-preview">
            <strong>{tr('阅读预览')}</strong>
            <p>{tr('每一步准备，都让下一次机会更近。')}</p>
            <small>{tr('名称、正文和辅助信息会一起调整。')}</small>
          </div>
        </fieldset>
        <fieldset>
          <legend>{tr('日语假名')}</legend>
          <div className="settings-language">
            <div>
              <label htmlFor="japanese-readings">{tr('日语显示假名')}</label>
              <p id="japanese-readings-description">{tr('在日语简历详情和预览中显示已提供的假名标记。')}</p>
            </div>
            <Switch
              id="japanese-readings"
              checked={appearance.showJapaneseReadings}
              onCheckedChange={(checked) => update({ showJapaneseReadings: checked })}
              aria-describedby="japanese-readings-description"
            />
          </div>
          <div className="settings-preview" lang="ja">
            {appearance.showJapaneseReadings
              ? <ruby>開発経験<rt>かいはつけいけん</rt></ruby>
              : '開発経験'}
          </div>
        </fieldset>
        <div className="settings-language">
          <div>
            <h3>{tr('显示语言')}</h3>
            <p>{tr('切换界面语言，履历原文保持不变。')}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </div>
      <div className="settings-bottom">
        <p role="status">
          {tr(
            saved
              ? '已自动保存到此浏览器。'
              : '浏览器无法保存设置，本次调整仍然有效。',
          )}
        </p>
        <button onClick={reset}>
          <RotateCcw size={16} />
          {tr('恢复默认外观')}
        </button>
      </div>
    </section>
  );
}
