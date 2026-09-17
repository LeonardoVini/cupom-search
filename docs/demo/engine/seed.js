// Gerado por scripts/build-demo.ts a partir de data/coupons.seed.json.
export const SEED = [
  {
    "id": "demo-pichau-perifericos",
    "storeId": "pichau",
    "code": "DEMO-PERIFERICOS10",
    "description": "10% em periféricos e móveis gamer (exemplo)",
    "type": "percent",
    "value": 10,
    "rules": {
      "minCartValue": 300,
      "maxDiscountValue": 200,
      "includeCategories": [
        "moveis",
        "escritorio",
        "informatica"
      ]
    },
    "daysUntilExpiry": 20,
    "daysSinceSeen": 1
  },
  {
    "id": "demo-pichau-pix",
    "storeId": "pichau",
    "code": "DEMO-PIX5",
    "description": "5% adicional pagando no Pix (exemplo)",
    "type": "percent",
    "value": 5,
    "rules": {
      "paymentMethods": [
        "pix"
      ]
    },
    "daysUntilExpiry": 45,
    "daysSinceSeen": 3
  },
  {
    "id": "demo-pichau-primeira",
    "storeId": "pichau",
    "code": "DEMO-BEMVINDO",
    "description": "R$ 50 off na primeira compra (exemplo)",
    "type": "fixed",
    "value": 50,
    "rules": {
      "minCartValue": 500,
      "firstPurchaseOnly": true
    },
    "daysUntilExpiry": 60,
    "daysSinceSeen": 12
  },
  {
    "id": "demo-pichau-hardware",
    "storeId": "pichau",
    "code": "DEMO-HARDWARE15",
    "description": "15% só em placas de vídeo (exemplo)",
    "type": "percent",
    "value": 15,
    "rules": {
      "includeCategories": [
        "placa de video"
      ],
      "maxDiscountValue": 400
    },
    "daysUntilExpiry": 5,
    "daysSinceSeen": 2
  },
  {
    "id": "demo-pichau-frete",
    "storeId": "pichau",
    "code": "DEMO-FRETEGRATIS",
    "description": "Frete grátis acima de R$ 999 (exemplo)",
    "type": "shipping",
    "value": 0,
    "rules": {
      "minCartValue": 999
    },
    "daysUntilExpiry": 9,
    "daysSinceSeen": 30
  },
  {
    "id": "demo-kabum-geral",
    "storeId": "kabum",
    "code": "DEMO-KB7",
    "description": "7% em todo o site (exemplo)",
    "type": "percent",
    "value": 7,
    "rules": {
      "minCartValue": 200,
      "maxDiscountValue": 150
    },
    "daysUntilExpiry": 14,
    "daysSinceSeen": 2
  },
  {
    "id": "demo-madeiramadeira-moveis",
    "storeId": "madeiramadeira",
    "code": "DEMO-MESA12",
    "description": "12% em mesas e escrivaninhas (exemplo)",
    "type": "percent",
    "value": 12,
    "rules": {
      "includeCategories": [
        "moveis",
        "mesa",
        "escrivaninha"
      ],
      "minCartValue": 250
    },
    "daysUntilExpiry": 30,
    "daysSinceSeen": 4
  },
  {
    "id": "demo-magalu-app",
    "storeId": "magalu",
    "code": "DEMO-APP20",
    "description": "R$ 20 off exclusivo no app (exemplo)",
    "type": "fixed",
    "value": 20,
    "rules": {
      "appOnly": true,
      "minCartValue": 150
    },
    "daysUntilExpiry": 25,
    "daysSinceSeen": 6
  }
];
