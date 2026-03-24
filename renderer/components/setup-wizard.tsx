'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Check, ChevronRight, ChevronLeft, Loader2, Building2, Image, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Barangay info
  const [barangayName, setBarangayName] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [province, setProvince] = useState('');
  const [numberOfPuroks, setNumberOfPuroks] = useState('7');

  // Step 2: Logo
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  // Step 3: Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const canProceedStep1 = barangayName.trim() && municipality.trim() && province.trim();
  const canFinish = newPassword.length >= 6 && newPassword === confirmPassword;

  const handleUploadLogo = async () => {
    const api = getAPI();
    if (!api) return;

    const result = await api.selectFile({
      title: 'Select Barangay Logo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      setLogoPath(filePath);
      // Create a preview — read the file through the logo save mechanism
      const savedPath = await api.saveLogo(filePath);
      const base64 = await api.getLogoBase64();
      if (base64) setLogoPreview(base64);
    }
  };

  const handleFinish = async () => {
    const api = getAPI();
    if (!api) return;

    setSaving(true);
    try {
      // Save barangay info
      await api.setSetting('barangay_name', barangayName.trim());
      await api.setSetting('municipality', municipality.trim());
      await api.setSetting('province', province.trim());
      await api.setSetting('number_of_puroks', numberOfPuroks);

      // Change password (admin user is always id=1)
      if (newPassword) {
        await api.updatePassword(1, 'admin123', newPassword);
      }

      // Mark setup as completed
      await api.setSetting('setup_completed', '1');

      toast.success(i18n.language === 'fil'
        ? 'Matagumpay na na-setup ang system!'
        : i18n.language === 'bisaya'
          ? 'Malampuson nga na-setup ang sistema!'
          : 'System setup completed successfully!');

      onComplete();
    } catch (err) {
      toast.error('Setup failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Step indicators
  const steps = [
    { icon: Building2, label: t('setup.step1Title') },
    { icon: Image, label: t('setup.step2Title') },
    { icon: Lock, label: t('setup.step3Title') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 via-background to-blue-50/50 dark:from-violet-950/20 dark:via-background dark:to-blue-950/20" />

      <div className="relative w-full max-w-lg mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">{t('setup.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('setup.subtitle')}</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isCompleted = step > stepNum;
            return (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 h-0.5 ${step > stepNum ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card shadow-lg p-6">
          {/* Step 1: Barangay Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {t('setup.step1Title')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t('setup.step1Desc')}</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('setup.barangayName')} *</Label>
                  <Input
                    value={barangayName}
                    onChange={(e) => setBarangayName(e.target.value)}
                    placeholder="e.g. Barangay Barayong"
                    autoFocus
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('setup.municipality')} *</Label>
                  <Input
                    value={municipality}
                    onChange={(e) => setMunicipality(e.target.value)}
                    placeholder="e.g. Magsaysay"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('setup.province')} *</Label>
                  <Input
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    placeholder="e.g. Davao del Sur"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('setup.numberOfPuroks')}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={numberOfPuroks}
                    onChange={(e) => setNumberOfPuroks(e.target.value)}
                    className="h-10 w-24"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
                  {t('setup.next')}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Logo Upload */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Image className="h-5 w-5 text-primary" />
                  {t('setup.step2Title')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t('setup.step2Desc')}</p>
              </div>

              <div className="flex flex-col items-center py-6">
                {logoPreview ? (
                  <div className="space-y-4 text-center">
                    <img
                      src={logoPreview}
                      alt="Barangay Logo"
                      className="w-32 h-32 object-contain rounded-xl border bg-white p-2 mx-auto"
                    />
                    <Button variant="outline" onClick={handleUploadLogo}>
                      <Upload className="mr-2 h-4 w-4" />
                      {t('setup.changeLogo')}
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={handleUploadLogo}
                    className="w-40 h-40 rounded-xl border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground/40" />
                    <span className="text-sm text-muted-foreground">{t('setup.uploadLogo')}</span>
                  </button>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {t('setup.back')}
                </Button>
                <Button onClick={() => setStep(3)}>
                  {logoPreview ? t('setup.next') : t('setup.skipForNow')}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Password Change */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  {t('setup.step3Title')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t('setup.step3Desc')}</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('setup.newPassword')}</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10"
                  />
                  {newPassword && newPassword.length < 6 && (
                    <p className="text-xs text-destructive">{t('setup.passwordMinLength')}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('setup.confirmPassword')}</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">{t('setup.passwordsDoNotMatch')}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {t('setup.back')}
                </Button>
                <Button onClick={handleFinish} disabled={!canFinish || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('setup.settingUp')}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {t('setup.finish')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Language selector at the bottom */}
        <div className="flex justify-center gap-2 mt-6">
          {[
            { code: 'en', label: 'English' },
            { code: 'fil', label: 'Filipino' },
            { code: 'bisaya', label: 'Bisaya' },
          ].map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                i18n.changeLanguage(lang.code);
                localStorage.setItem('language', lang.code);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                i18n.language === lang.code
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
