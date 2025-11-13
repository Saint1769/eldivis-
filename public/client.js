
const wheel = document.getElementById('wheelOverlay');
const img = document.getElementById('wheelImage');
const spinBtn = document.getElementById('spinBtn');
const result = document.getElementById('result');

const segments = 12;
const segmentSize = 360/segments;
const labels = ['LOSE','$5','$200','$500','$1000','$20','$100','$300','$50','$700','$2000','$75'];

let spinning = false;

function randBetween(a,b){ return Math.floor(Math.random()*(b-a)+a); }

spinBtn.onclick = ()=>{
  if(spinning) return;
  spinning = true;
  result.innerText='Крутим...';
  const pickIndex = Math.floor(Math.random()*segments);
  // choose random angle inside the segment
  const angleInSegment = randBetween(pickIndex*segmentSize, (pickIndex+1)*segmentSize);
  const fullSpins = 4 + Math.floor(Math.random()*3); // 4-6 spins
  const final = fullSpins*360 + (360 - angleInSegment) + 15; // offset to align pointer nicely
  wheel.style.transition = 'transform 5s cubic-bezier(.2,.9,.2,1)';
  img.style.transition = 'transform 5s cubic-bezier(.2,.9,.2,1)';
  wheel.style.transform = 'rotate(' + final + 'deg)';
  img.style.transform = 'rotate(' + (final/20) + 'deg)';
  setTimeout(()=>{
    spinning = false;
    result.innerText = 'Вы выиграли: ' + labels[pickIndex];
    wheel.style.transition = 'none'; img.style.transition='none';
  }, 5200);
};

// populate features list (50+ entries)
const features = [
"VIP тестовый профиль с бейджем","Ежедневное колесо фортуны с анимацией","Подарки NFT","Приватные чаты","Отправка файлов","Удаление сообщений",
"Блокировка пользователей","Реакции на сообщения","Стикеры и GIF","Поиск пользователей","Тёмная/светлая тема","Сезонные рамки",
"Мини-игры","Анимации при подарках","История активности","Статистика пользователей","Закрепленные сообщения","Голосовые сообщения",
"Превью видео","Массовая загрузка файлов","Категории NFT","Рейтинг пользователей","Достижения","Подсказки и туториалы","Экспорт чатов",
"Импорт/бэкап данных","Интеграция с Postgres","События и вебхуки","Админ-панель (демо)","VIP-only чат","Отправка монет",
"Обмен подарками","Коллекционные предметы","Рамки для аватаров","Фильтры фото","Анимированные бейджи","Ежедневные миссии",
"Подписки тестовые","Интерактивные эмодзи","Поддержка групповых чатов","Поиск по сообщениям","Отмена отправки (recall)","Отметка прочитано",
"Опции приватности","Пользовательские настройки","Темы оформления","Система уровней","Топ пользователей","Быстрые ответы"
];
const featuresDiv = document.getElementById('features');
features.forEach(f=>{ const d=document.createElement('div'); d.className='feature'; d.innerText='• '+f; featuresDiv.appendChild(d); });
