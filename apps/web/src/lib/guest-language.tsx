"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type GuestLanguageCode = "en" | "et" | "es" | "fr" | "ru" | "de";

const STORAGE_KEY = "guest-language";

export type TranslationKey =
  | "language.label"
  | "language.en"
  | "language.et"
  | "language.es"
  | "language.fr"
  | "language.ru"
  | "language.de"
  | "setup.tagline"
  | "setup.roomNumber"
  | "setup.placeholder"
  | "setup.pairingCode"
  | "setup.pairingPlaceholder"
  | "setup.pairingHint"
  | "setup.activating"
  | "setup.start"
  | "setup.activationError"
  | "connection.connected"
  | "connection.reconnecting"
  | "connection.disconnected"
  | "connection.roomLabel"
  | "requests.empty"
  | "requests.pastOrders"
  | "request.received.label"
  | "request.received.description"
  | "request.in_progress.label"
  | "request.in_progress.description"
  | "request.delivered.label"
  | "request.delivered.description"
  | "request.partially_delivered.label"
  | "request.partially_delivered.description"
  | "request.rejected.label"
  | "request.rejected.description"
  | "request.yourRequest"
  | "confirm.itemsFound"
  | "confirm.cancel"
  | "confirm.confirm"
  | "partial.description"
  | "partial.available"
  | "partial.unavailable"
  | "partial.confirm"
  | "error.voiceNoSpeech"
  | "error.voiceTranscription"
  | "error.voicePermission"
  | "error.voiceUnavailable"
  | "error.voiceRecording"
  | "error.voicePassiveWake"
  | "error.noMatchingItems"
  | "error.sessionRevoked"
  | "error.dismiss"
  | "listening.placeholder"
  | "listening.finishing"
  | "listening.stop"
  | "listening.start"
  | "processing.message";

type TranslationDictionary = Record<GuestLanguageCode, Record<TranslationKey, string>>;

const TRANSLATIONS: TranslationDictionary = {
  en: {
    "language.label": "Language",
    "language.en": "English",
    "language.et": "Eesti",
    "language.es": "Español",
    "language.fr": "Français",
    "language.ru": "Русский",
    "language.de": "Deutsch",
    "setup.tagline": "Voice-powered room service",
    "setup.roomNumber": "Room Number",
    "setup.placeholder": "e.g. 204",
    "setup.pairingCode": "Pairing Code",
    "setup.pairingPlaceholder": "------",
    "setup.pairingHint": "Ask staff to issue a 6-digit code for this room.",
    "setup.activating": "Activating...",
    "setup.start": "Start",
    "setup.activationError": "Failed to activate tablet.",
    "connection.connected": "Connected",
    "connection.reconnecting": "Reconnecting...",
    "connection.disconnected": "Disconnected",
    "connection.roomLabel": "Room {roomNumber}",
    "requests.empty": "No requests yet. Tap the orb below to get started.",
    "requests.pastOrders": "Past Orders",
    "request.received.label": "Order Received",
    "request.received.description": "Your request has been sent to the front desk.",
    "request.in_progress.label": "In Progress",
    "request.in_progress.description": "Staff are preparing your items now.",
    "request.delivered.label": "Delivered",
    "request.delivered.description": "Your items have been delivered. Enjoy your stay!",
    "request.partially_delivered.label": "Partially Delivered",
    "request.partially_delivered.description": "Sorry, we couldn’t fully complete your order. See the note from staff below.",
    "request.rejected.label": "Rejected",
    "request.rejected.description": "Sorry, we couldn’t complete this request. See the note from staff below.",
    "request.yourRequest": "You said",
    "confirm.itemsFound": "Items found",
    "confirm.cancel": "Cancel",
    "confirm.confirm": "Confirm",
    "partial.description": "Some items aren't available right now. Send the rest?",
    "partial.available": "Available now",
    "partial.unavailable": "Not available",
    "partial.confirm": "Send partial order",
    "error.voiceNoSpeech": "I couldn't catch that. Please try again and speak a little closer.",
    "error.voiceTranscription": "I heard you, but couldn't understand the request clearly. Please try again.",
    "error.voicePermission": "Microphone access is blocked. Please allow microphone access and try again.",
    "error.voiceUnavailable": "This device couldn't start the microphone right now. Please try again.",
    "error.voiceRecording": "There was a problem with the voice recording. Please try again.",
    "error.voicePassiveWake": "Passive listening couldn't start. Please tap the orb to speak.",
    "error.noMatchingItems": "I heard you, but couldn't match that to a hotel item. Please try again with a request like towels, water, or an iron.",
    "error.sessionRevoked": "Staff disconnected this tablet. Please re-pair to continue.",
    "error.dismiss": "Dismiss",
    "listening.placeholder": "Listening...",
    "listening.finishing": "Finishing...",
    "listening.stop": "Stop listening",
    "listening.start": "Start listening",
    "processing.message": "Processing your request...",
  },
  et: {
    "language.label": "Keel",
    "language.en": "English",
    "language.et": "Eesti",
    "language.es": "Español",
    "language.fr": "Français",
    "language.ru": "Русский",
    "language.de": "Deutsch",
    "setup.tagline": "Hääljuhtimisega toateenindus",
    "setup.roomNumber": "Toa number",
    "setup.placeholder": "nt 204",
    "setup.pairingCode": "Sidumiskood",
    "setup.pairingPlaceholder": "------",
    "setup.pairingHint": "Palu personalil väljastada sellele toale 6-kohaline kood.",
    "setup.activating": "Aktiveerin...",
    "setup.start": "Alusta",
    "setup.activationError": "Tahvelarvuti aktiveerimine ebaõnnestus.",
    "connection.connected": "Ühendatud",
    "connection.reconnecting": "Taastan ühendust...",
    "connection.disconnected": "Ühendus puudub",
    "connection.roomLabel": "Tuba {roomNumber}",
    "requests.empty": "Päringuid veel ei ole. Alustamiseks puuduta all olevat kera.",
    "requests.pastOrders": "Varasemad tellimused",
    "request.received.label": "Tellimus vastu võetud",
    "request.received.description": "Teie päring on saadetud vastuvõttu.",
    "request.in_progress.label": "Töös",
    "request.in_progress.description": "Personal valmistab teie tellimust ette.",
    "request.delivered.label": "Kohale toimetatud",
    "request.delivered.description": "Teie tellimus on kohale toimetatud. Mõnusat viibimist!",
    "request.partially_delivered.label": "Osaliselt kohale toimetatud",
    "request.partially_delivered.description": "Vabandame, me ei saanud teie tellimust täies mahus täita. Personali märkus allpool.",
    "request.rejected.label": "Tagasi lükatud",
    "request.rejected.description": "Vabandame, me ei saanud seda päringut täita. Personali märkus allpool.",
    "request.yourRequest": "Sinu sõnum",
    "confirm.itemsFound": "Leitud esemed",
    "confirm.cancel": "Tühista",
    "confirm.confirm": "Kinnita",
    "partial.description": "Mõnda eset pole praegu saadaval. Kas saadan ülejäänud?",
    "partial.available": "Praegu saadaval",
    "partial.unavailable": "Ei ole saadaval",
    "partial.confirm": "Saada osaline tellimus",
    "error.voiceNoSpeech": "Ma ei saanud sellest hästi aru. Proovi uuesti ja räägi veidi lähemalt.",
    "error.voiceTranscription": "Ma kuulsin sind, aga ei saanud päringust piisavalt selgelt aru. Proovi uuesti.",
    "error.voicePermission": "Mikrofoni kasutus on blokeeritud. Luba mikrofon ja proovi uuesti.",
    "error.voiceUnavailable": "Selle seadme mikrofon ei käivitunud praegu. Proovi uuesti.",
    "error.voiceRecording": "Häälsalvestusega tekkis probleem. Proovi uuesti.",
    "error.voicePassiveWake": "Taustakuulamist ei saanud käivitada. Rääkimiseks puuduta kera.",
    "error.noMatchingItems": "Ma kuulsin sind, aga ei leidnud sellele hotellis sobivat eset. Proovi uuesti näiteks käterätikute, vee või triikrauaga.",
    "error.sessionRevoked": "Personal ühendas selle tahvli lahti. Palun paarida uuesti.",
    "error.dismiss": "Sulge",
    "listening.placeholder": "Kuulan...",
    "listening.finishing": "Lõpetan...",
    "listening.stop": "Peata kuulamine",
    "listening.start": "Alusta kuulamist",
    "processing.message": "Töötlen teie päringut...",
  },
  es: {
    "language.label": "Idioma",
    "language.en": "English",
    "language.et": "Eesti",
    "language.es": "Español",
    "language.fr": "Français",
    "language.ru": "Русский",
    "language.de": "Deutsch",
    "setup.tagline": "Servicio de habitaciones por voz",
    "setup.roomNumber": "Número de habitación",
    "setup.placeholder": "p. ej. 204",
    "setup.pairingCode": "Código de Emparejamiento",
    "setup.pairingPlaceholder": "------",
    "setup.pairingHint": "Pídele al personal un código de 6 dígitos para esta habitación.",
    "setup.activating": "Activando...",
    "setup.start": "Empezar",
    "setup.activationError": "No se pudo activar la tableta.",
    "connection.connected": "Conectado",
    "connection.reconnecting": "Reconectando...",
    "connection.disconnected": "Desconectado",
    "connection.roomLabel": "Habitación {roomNumber}",
    "requests.empty": "Aún no hay solicitudes. Toca la esfera de abajo para empezar.",
    "requests.pastOrders": "Pedidos anteriores",
    "request.received.label": "Pedido recibido",
    "request.received.description": "Tu solicitud se ha enviado a recepción.",
    "request.in_progress.label": "En progreso",
    "request.in_progress.description": "El personal está preparando tus artículos.",
    "request.delivered.label": "Entregado",
    "request.delivered.description": "Tus artículos han sido entregados. Disfruta tu estancia.",
    "request.partially_delivered.label": "Entregado parcialmente",
    "request.partially_delivered.description": "Lo sentimos, no pudimos completar totalmente tu pedido. Consulta la nota del personal abajo.",
    "request.rejected.label": "Rechazado",
    "request.rejected.description": "Lo sentimos, no pudimos completar esta solicitud. Consulta la nota del personal abajo.",
    "request.yourRequest": "Dijiste",
    "confirm.itemsFound": "Artículos encontrados",
    "confirm.cancel": "Cancelar",
    "confirm.confirm": "Confirmar",
    "partial.description": "Algunos artículos no están disponibles. ¿Enviamos el resto?",
    "partial.available": "Disponible ahora",
    "partial.unavailable": "No disponible",
    "partial.confirm": "Enviar pedido parcial",
    "error.voiceNoSpeech": "No pude captar eso bien. Inténtalo de nuevo y habla un poco más cerca.",
    "error.voiceTranscription": "Te escuché, pero no pude entender claramente la solicitud. Inténtalo de nuevo.",
    "error.voicePermission": "El acceso al micrófono está bloqueado. Permite el acceso al micrófono e inténtalo de nuevo.",
    "error.voiceUnavailable": "Este dispositivo no pudo iniciar el micrófono ahora mismo. Inténtalo de nuevo.",
    "error.voiceRecording": "Hubo un problema con la grabación de voz. Inténtalo de nuevo.",
    "error.voicePassiveWake": "No se pudo iniciar la escucha pasiva. Toca la esfera para hablar.",
    "error.noMatchingItems": "Te escuché, pero no pude asociarlo a un artículo del hotel. Inténtalo de nuevo con algo como toallas, agua o una plancha.",
    "error.sessionRevoked": "El personal desconectó esta tableta. Vuelve a vincularla para continuar.",
    "error.dismiss": "Cerrar",
    "listening.placeholder": "Escuchando...",
    "listening.finishing": "Terminando...",
    "listening.stop": "Detener escucha",
    "listening.start": "Empezar a escuchar",
    "processing.message": "Procesando tu solicitud...",
  },
  fr: {
    "language.label": "Langue",
    "language.en": "English",
    "language.et": "Eesti",
    "language.es": "Español",
    "language.fr": "Français",
    "language.ru": "Русский",
    "language.de": "Deutsch",
    "setup.tagline": "Service en chambre par commande vocale",
    "setup.roomNumber": "Numéro de chambre",
    "setup.placeholder": "ex. 204",
    "setup.pairingCode": "Code de Jumelage",
    "setup.pairingPlaceholder": "------",
    "setup.pairingHint": "Demandez au personnel un code à 6 chiffres pour cette chambre.",
    "setup.activating": "Activation...",
    "setup.start": "Commencer",
    "setup.activationError": "Impossible d’activer la tablette.",
    "connection.connected": "Connecté",
    "connection.reconnecting": "Reconnexion...",
    "connection.disconnected": "Déconnecté",
    "connection.roomLabel": "Chambre {roomNumber}",
    "requests.empty": "Aucune demande pour le moment. Touchez l’orbe ci-dessous pour commencer.",
    "requests.pastOrders": "Commandes précédentes",
    "request.received.label": "Commande reçue",
    "request.received.description": "Votre demande a été envoyée à la réception.",
    "request.in_progress.label": "En cours",
    "request.in_progress.description": "Le personnel prépare vos articles.",
    "request.delivered.label": "Livré",
    "request.delivered.description": "Vos articles ont été livrés. Profitez de votre séjour !",
    "request.partially_delivered.label": "Partiellement livré",
    "request.partially_delivered.description": "Désolés, nous n’avons pas pu traiter votre demande en totalité. Voir le message du personnel ci-dessous.",
    "request.rejected.label": "Refusé",
    "request.rejected.description": "Désolés, nous n’avons pas pu honorer cette demande. Voir le message du personnel ci-dessous.",
    "request.yourRequest": "Vous avez dit",
    "confirm.itemsFound": "Articles trouvés",
    "confirm.cancel": "Annuler",
    "confirm.confirm": "Confirmer",
    "partial.description": "Certains articles ne sont pas disponibles. Envoyer le reste ?",
    "partial.available": "Disponible",
    "partial.unavailable": "Non disponible",
    "partial.confirm": "Envoyer la commande partielle",
    "error.voiceNoSpeech": "Je n’ai pas bien compris. Veuillez réessayer en parlant un peu plus près.",
    "error.voiceTranscription": "Je vous ai entendu, mais je n’ai pas compris clairement la demande. Veuillez réessayer.",
    "error.voicePermission": "L’accès au microphone est bloqué. Veuillez autoriser le microphone puis réessayer.",
    "error.voiceUnavailable": "Cet appareil n’a pas pu démarrer le microphone pour le moment. Veuillez réessayer.",
    "error.voiceRecording": "Un problème est survenu pendant l’enregistrement vocal. Veuillez réessayer.",
    "error.voicePassiveWake": "L’écoute passive n’a pas pu démarrer. Touchez l’orbe pour parler.",
    "error.noMatchingItems": "Je vous ai entendu, mais je n’ai pas pu associer cela à un article de l’hôtel. Réessayez avec quelque chose comme des serviettes, de l’eau ou un fer à repasser.",
    "error.sessionRevoked": "Le personnel a déconnecté cette tablette. Veuillez la réappairer pour continuer.",
    "error.dismiss": "Fermer",
    "listening.placeholder": "J’écoute...",
    "listening.finishing": "Finalisation...",
    "listening.stop": "Arrêter l’écoute",
    "listening.start": "Commencer l’écoute",
    "processing.message": "Traitement de votre demande...",
  },
  ru: {
    "language.label": "Язык",
    "language.en": "English",
    "language.et": "Eesti",
    "language.es": "Español",
    "language.fr": "Français",
    "language.ru": "Русский",
    "language.de": "Deutsch",
    "setup.tagline": "Голосовое обслуживание номеров",
    "setup.roomNumber": "Номер комнаты",
    "setup.placeholder": "например, 204",
    "setup.pairingCode": "Код сопряжения",
    "setup.pairingPlaceholder": "------",
    "setup.pairingHint": "Попросите персонал выдать 6-значный код для этого номера.",
    "setup.activating": "Активация...",
    "setup.start": "Начать",
    "setup.activationError": "Не удалось активировать планшет.",
    "connection.connected": "Подключено",
    "connection.reconnecting": "Переподключение...",
    "connection.disconnected": "Нет подключения",
    "connection.roomLabel": "Комната {roomNumber}",
    "requests.empty": "Запросов пока нет. Нажмите на сферу ниже, чтобы начать.",
    "requests.pastOrders": "Предыдущие заказы",
    "request.received.label": "Заказ получен",
    "request.received.description": "Ваш запрос отправлен на стойку регистрации.",
    "request.in_progress.label": "В процессе",
    "request.in_progress.description": "Персонал готовит ваши товары.",
    "request.delivered.label": "Доставлено",
    "request.delivered.description": "Ваши товары доставлены. Приятного пребывания!",
    "request.partially_delivered.label": "Частично доставлено",
    "request.partially_delivered.description": "Приносим извинения, мы не смогли выполнить заказ полностью. Сообщение от персонала ниже.",
    "request.rejected.label": "Отклонено",
    "request.rejected.description": "Приносим извинения, мы не смогли выполнить этот запрос. Сообщение от персонала ниже.",
    "request.yourRequest": "Вы сказали",
    "confirm.itemsFound": "Найденные позиции",
    "confirm.cancel": "Отмена",
    "confirm.confirm": "Подтвердить",
    "partial.description": "Некоторых позиций сейчас нет. Отправить остальное?",
    "partial.available": "Доступно сейчас",
    "partial.unavailable": "Недоступно",
    "partial.confirm": "Отправить частичный заказ",
    "error.voiceNoSpeech": "Я не смог хорошо расслышать. Попробуйте ещё раз и говорите чуть ближе.",
    "error.voiceTranscription": "Я вас услышал, но не смог чётко понять запрос. Попробуйте ещё раз.",
    "error.voicePermission": "Доступ к микрофону заблокирован. Разрешите доступ к микрофону и попробуйте снова.",
    "error.voiceUnavailable": "Сейчас не удалось запустить микрофон на этом устройстве. Попробуйте снова.",
    "error.voiceRecording": "Во время голосовой записи возникла проблема. Попробуйте снова.",
    "error.voicePassiveWake": "Не удалось включить фоновое прослушивание. Нажмите на сферу, чтобы говорить.",
    "error.noMatchingItems": "Я вас услышал, но не смог сопоставить это с предметом в отеле. Попробуйте снова с чем-то вроде полотенец, воды или утюга.",
    "error.sessionRevoked": "Персонал отключил этот планшет. Выполните повторное сопряжение, чтобы продолжить.",
    "error.dismiss": "Закрыть",
    "listening.placeholder": "Слушаю...",
    "listening.finishing": "Завершаю...",
    "listening.stop": "Остановить прослушивание",
    "listening.start": "Начать прослушивание",
    "processing.message": "Обрабатываем ваш запрос...",
  },
  de: {
    "language.label": "Sprache",
    "language.en": "English",
    "language.et": "Eesti",
    "language.es": "Español",
    "language.fr": "Français",
    "language.ru": "Русский",
    "language.de": "Deutsch",
    "setup.tagline": "Sprachgesteuerter Zimmerservice",
    "setup.roomNumber": "Zimmernummer",
    "setup.placeholder": "z. B. 204",
    "setup.pairingCode": "Kopplungscode",
    "setup.pairingPlaceholder": "------",
    "setup.pairingHint": "Bitten Sie das Personal um einen 6-stelligen Code für dieses Zimmer.",
    "setup.activating": "Aktivierung...",
    "setup.start": "Starten",
    "setup.activationError": "Tablet konnte nicht aktiviert werden.",
    "connection.connected": "Verbunden",
    "connection.reconnecting": "Verbindung wird wiederhergestellt...",
    "connection.disconnected": "Getrennt",
    "connection.roomLabel": "Zimmer {roomNumber}",
    "requests.empty": "Noch keine Anfragen. Tippe unten auf die Kugel, um zu starten.",
    "requests.pastOrders": "Frühere Bestellungen",
    "request.received.label": "Bestellung eingegangen",
    "request.received.description": "Ihre Anfrage wurde an die Rezeption gesendet.",
    "request.in_progress.label": "In Bearbeitung",
    "request.in_progress.description": "Das Personal bereitet Ihre Artikel vor.",
    "request.delivered.label": "Geliefert",
    "request.delivered.description": "Ihre Artikel wurden geliefert. Genießen Sie Ihren Aufenthalt!",
    "request.partially_delivered.label": "Teilweise geliefert",
    "request.partially_delivered.description": "Entschuldigung, wir konnten Ihre Bestellung nicht vollständig ausführen. Hinweis vom Personal unten.",
    "request.rejected.label": "Abgelehnt",
    "request.rejected.description": "Entschuldigung, wir konnten diese Anfrage nicht erfüllen. Hinweis vom Personal unten.",
    "request.yourRequest": "Sie sagten",
    "confirm.itemsFound": "Gefundene Artikel",
    "confirm.cancel": "Abbrechen",
    "confirm.confirm": "Bestätigen",
    "partial.description": "Einige Artikel sind gerade nicht verfügbar. Den Rest senden?",
    "partial.available": "Jetzt verfügbar",
    "partial.unavailable": "Nicht verfügbar",
    "partial.confirm": "Teilbestellung senden",
    "error.voiceNoSpeech": "Ich konnte das nicht gut erfassen. Bitte versuche es noch einmal und sprich etwas näher.",
    "error.voiceTranscription": "Ich habe dich gehört, konnte die Anfrage aber nicht klar verstehen. Bitte versuche es noch einmal.",
    "error.voicePermission": "Der Mikrofonzugriff ist blockiert. Bitte erlaube den Mikrofonzugriff und versuche es erneut.",
    "error.voiceUnavailable": "Dieses Gerät konnte das Mikrofon gerade nicht starten. Bitte versuche es erneut.",
    "error.voiceRecording": "Bei der Sprachaufnahme ist ein Problem aufgetreten. Bitte versuche es erneut.",
    "error.voicePassiveWake": "Passives Zuhören konnte nicht gestartet werden. Tippe auf die Kugel, um zu sprechen.",
    "error.noMatchingItems": "Ich habe dich gehört, konnte das aber keinem Hotelartikel zuordnen. Versuche es noch einmal mit etwas wie Handtüchern, Wasser oder einem Bügeleisen.",
    "error.sessionRevoked": "Das Personal hat dieses Tablet getrennt. Bitte erneut koppeln, um fortzufahren.",
    "error.dismiss": "Schließen",
    "listening.placeholder": "Ich höre zu...",
    "listening.finishing": "Wird beendet...",
    "listening.stop": "Zuhören beenden",
    "listening.start": "Zuhören starten",
    "processing.message": "Ihre Anfrage wird verarbeitet...",
  },
};

const LANGUAGE_OPTIONS = [
  { code: "en", labelKey: "language.en" },
  { code: "et", labelKey: "language.et" },
  { code: "es", labelKey: "language.es" },
  { code: "fr", labelKey: "language.fr" },
  { code: "ru", labelKey: "language.ru" },
  { code: "de", labelKey: "language.de" },
] as const satisfies ReadonlyArray<{ code: GuestLanguageCode; labelKey: TranslationKey }>;

interface GuestLanguageContextValue {
  language: GuestLanguageCode;
  setLanguage: (language: GuestLanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const GuestLanguageContext = createContext<GuestLanguageContextValue | null>(null);

function replaceTemplate(
  template: string,
  params: Record<string, string | number> = {},
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

export function getGuestLocale(language: GuestLanguageCode) {
  const localeMap: Record<GuestLanguageCode, string> = {
    en: "en-US",
    et: "et-EE",
    es: "es-ES",
    fr: "fr-FR",
    ru: "ru-RU",
    de: "de-DE",
  };

  return localeMap[language];
}

export function getGuestLanguageName(language: GuestLanguageCode) {
  return TRANSLATIONS[language][`language.${language}`];
}

export function getGuestLanguageOptions() {
  return LANGUAGE_OPTIONS;
}

export function GuestLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<GuestLanguageCode>(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (
      stored === "en" ||
      stored === "et" ||
      stored === "es" ||
      stored === "fr" ||
      stored === "ru" ||
      stored === "de"
    ) {
      return stored;
    }

    return "en";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = getGuestLocale(language);
  }, [language]);

  const value = useMemo<GuestLanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => replaceTemplate(TRANSLATIONS[language][key], params),
  }), [language]);

  return (
    <GuestLanguageContext.Provider value={value}>
      {children}
    </GuestLanguageContext.Provider>
  );
}

export function useGuestLanguage() {
  const context = useContext(GuestLanguageContext);

  if (!context) {
    throw new Error("useGuestLanguage must be used within GuestLanguageProvider");
  }

  return context;
}
