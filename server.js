// server.js - VERSIÓN FINAL CON PERSISTENCIA PARA RENDER Y HORA ARGENTINA
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const server = http.createServer(app);

// ======================
// FUNCIONES DE ZONA HORARIA (ARGENTINA)
// ======================
function getLocalTime(date = new Date()) {
    try {
        // Usar Intl.DateTimeFormat para Argentina
        const formatter = new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const parts = formatter.formatToParts(date);
        const timeObj = {};
        
        parts.forEach(part => {
            if (part.type !== 'literal') {
                timeObj[part.type] = part.value;
            }
        });
        
        // Fallback si algo falla
        if (!timeObj.hour || !timeObj.minute || !timeObj.second) {
            const d = new Date(date);
            // Ajustar manualmente para Argentina (UTC-3)
            const utcHours = d.getUTCHours();
            let argentinaHours = utcHours - 3;
            if (argentinaHours < 0) argentinaHours += 24;
            
            return `${argentinaHours.toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}`;
        }
        
        return `${timeObj.hour}:${timeObj.minute}:${timeObj.second}`;
    } catch (e) {
        console.error('Error en getLocalTime:', e);
        // Fallback simple
        const d = new Date(date);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    }
}

// ======================
// CONFIGURACIÓN SOCKET.IO
// ======================
const io = socketIo(server, {
  pingTimeout: 300000,      // 5 MINUTOS
  pingInterval: 50000,      // 50 segundos entre pings
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8
});

// ======================
// CONFIGURACIÓN EXPRESS
// ======================
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// ======================
// SISTEMA DE PERSISTENCIA PARA RENDER
// ======================
const STATE_BACKUP_FILE = path.join(__dirname, 'state-backup.json');
const BACKUP_INTERVAL = 60000; // Guardar cada minuto

// ======================
// DATOS DEL BAR IRLANDA - MENÚ COMPLETO
// ======================
const menu = [
  {
    id: 1,
    name: "Guinness",
    description: "Irlanda/Argentina - Alc. Vol 4.5% - Stout Original - 473cc",
    price: 8.50,
    category: "Cervezas",
    image: "https://arcordiezb2c.vteximg.com.br/arquivos/ids/185524/Cerveza-Guiness-Extra-Stout-x-473-Cc-1-21171.jpg?v=638635017719630000",
    popular: true,
    isDrink: true
  },
  {
    id: 2,
    name: "Goose Island",
    description: "EEUU - Alc. Vol 5% - Hazy IPA - 473cc",
    price: 9.00,
    category: "Cervezas",
    image: "https://masonlineprod.vtexassets.com/arquivos/ids/256210/Cerveza-Goose-Island-Hazy-Ipa-473cc-2-35778.jpg?v=637964553840630000",
    popular: true,
    isDrink: true
  },
  {
    id: 3,
    name: "Coca Cola",
    description: "1 Litro",
    price: 4.50,
    category: "Gaseosas",
    image: "https://vinotecacampos.com.ar/wp-content/uploads/16501-f1-33.jpg",
    popular: true,
    isDrink: true
  },
  {
    id: 4,
    name: "Mirinda Naranja",
    description: "500cc",
    price: 3.50,
    category: "Gaseosas",
    image: "https://elnenearg.vtexassets.com/arquivos/ids/155502/MIRINDA-NARANJA-500CC-1-431.jpg?v=637885929715230000",
    popular: false,
    isDrink: true
  },
  {
    id: 5,
    name: "Jameson Original",
    description: "Irlandés",
    price: 12.00,
    category: "Whiskies",
    image: "https://www.vinosbaco.com/wp-content/uploads/2023/06/64001_JAMESON-216x300.jpg",
    popular: true,
    isDrink: true
  },
  {
    id: 6,
    name: "Grant",
    description: "Escocés",
    price: 14.00,
    category: "Whiskies",
    image: "https://http2.mlstatic.com/D_NQ_NP_976701-MLA25593335902_052017-O.webp",
    popular: false,
    isDrink: true
  },
  {
    id: 7,
    name: "Jhonnie Walker Red",
    description: "Jhonnie Walker",
    price: 15.00,
    category: "Whiskies",
    image: "https://acdn-us.mitiendanube.com/stores/002/483/999/products/johnnie-walker-red-lt1-addbdc42a8a5967c9816787441530395-480-0.webp",
    popular: true,
    isDrink: true
  },
  {
    id: 8,
    name: "Jhonnie Walker Black",
    description: "Jhonnie Walker",
    price: 18.00,
    category: "Whiskies",
    image: "https://acdn-us.mitiendanube.com/stores/004/830/077/products/whisky-johnnie-walker-black-label-700ml-e8de75d9e5cc98d9e717252868986541-1024-1024.webp",
    popular: true,
    isDrink: true
  },
  {
    id: 9,
    name: "Fernet Branca - Medida",
    description: "Un trago de Fernet puro",
    price: 5.00,
    category: "Tragos",
    image: "https://acdn-us.mitiendanube.com/stores/001/157/846/products/copia-de-diseno-sin-nombre-2022-03-09t092828-1171-9b758b71490a1fc23b16468289376800-1024-1024.webp",
    popular: true,
    isDrink: true
  },
  {
    id: 23,
    name: "Fernet Branca - Preparado Chico",
    description: "Fernet con cola - vaso chico",
    price: 8.00,
    category: "Tragos",
    image: "https://acdn-us.mitiendanube.com/stores/001/157/846/products/copia-de-diseno-sin-nombre-2022-03-09t092828-1171-9b758b71490a1fc23b16468289376800-1024-1024.webp",
    popular: true,
    isDrink: true
  },
  {
    id: 24,
    name: "Fernet Branca - Preparado Grande",
    description: "Fernet con cola - vaso grande",
    price: 12.00,
    category: "Tragos",
    image: "https://acdn-us.mitiendanube.com/stores/001/157/846/products/copia-de-diseno-sin-nombre-2022-03-09t092828-1171-9b758b71490a1fc23b16468289376800-1024-1024.webp",
    popular: true,
    isDrink: true
  },
  {
    id: 10,
    name: "Champagne Novecento",
    description: "Novecento",
    price: 25.00,
    category: "Tragos",
    image: "https://jumboargentina.vtexassets.com/arquivos/ids/183547/Champa%C3%B1a-Novecento-Rosado-Dulce-X-750-Cc-Champa%C3%B1a-Novecento-Rose-Dulce-750-Cc-1-19873.jpg?v=636383446200030000",
    popular: false,
    isDrink: true
  },
  {
    id: 11,
    name: "Champagne Don Perignon",
    description: "Don Perignon Vintage",
    price: 120.00,
    category: "Tragos",
    image: "https://vinoelsalvador.com/wp-content/uploads/2025/05/DOM-PERIGNON-Blanc-Brut-Vintage-2010-MAGNUM.jpg",
    popular: false,
    isDrink: true
  },
  {
    id: 12,
    name: "Pizza Muzzarella",
    description: "Clásica pizza con queso muzzarella",
    price: 15.99,
    category: "Pizzas",
    image: "https://resizer.glanacion.com/resizer/v2/-OOYKN3HEDJFQXF3SOECAICFQWQ.jpg?auth=0f40a359db815154c30b0a689942817b35c4526464fff89970d39e1a625914d9&width=420&height=280&quality=70&smart=true",
    popular: true,
    isDrink: false
  },
  {
    id: 13,
    name: "Pizza Napolitana",
    description: "Muzzarella, tomate y albahaca",
    price: 16.50,
    category: "Pizzas",
    image: "https://rojoynegro.com.ar/pedidos/wp-content/uploads/2020/11/197c0df8-8373-447e-8c33-c44a2526aaed-1588171581145.png",
    popular: true,
    isDrink: false
  },
  {
    id: 14,
    name: "Pizza Roquefort",
    description: "Queso roquefort y nueces",
    price: 18.00,
    category: "Pizzas",
    image: "https://img-global.cpcdn.com/recipes/d53d5968c0b16951/1200x630cq80/photo.jpg",
    popular: false,
    isDrink: false
  },
  {
    id: 15,
    name: "Ensalada Gourmet",
    description: "Mezcla de hojas verdes, tomates cherry, croutons",
    price: 12.50,
    category: "Ensaladas",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
    popular: false,
    isDrink: false
  },
  {
    id: 16,
    name: "Ensalada Gourmet con Pollo",
    description: "Gourmet con Pollo Grillado",
    price: 15.00,
    category: "Ensaladas",
    image: "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
    popular: true,
    isDrink: false
  },
  {
    id: 17,
    name: "Irish Bot - Picada Chica",
    description: "Jamón fetas, salame fetas, queso fetas, aceitunas verdes, ají - Para 2 personas",
    price: 22.00,
    category: "Picadas",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7v1QYDCDj4XITQ-Az_zgRE_HG_4VW1AfnAw&s",
    popular: true,
    isDrink: false
  },
  {
    id: 18,
    name: "Papas Originales",
    description: "Con orégano",
    price: 6.50,
    category: "Papas",
    image: "https://images.squarespace-cdn.com/content/v1/644ea2f3486ddf270c1fc2be/f66067e5-5053-4d4e-821e-b60e89703e22/Patatas+crujientes+con+or%C3%A9gano+y+lim%C3%B3n.JPG",
    popular: true,
    isDrink: false
  },
  {
    id: 19,
    name: "Papas a la Crema",
    description: "Con muzarrella",
    price: 8.00,
    category: "Papas",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQi7r9AkHBS9-elx5Qvclw998bG4U7M7bGd2g&s",
    popular: true,
    isDrink: false
  },
  {
    id: 25,
    name: "Papas a la Crema",
    description: " Con cheddar",
    price: 9.00,
    category: "Papas",
    image: "https://truffle-assets.tastemadecontent.net/12851a77-papas-fritas-con-cheddar_l_es_thumbmp4.png",
    popular: true,
    isDrink: false
  },
  {
    id: 20,
    name: "Empanada de Carne",
    description: "Carne cortada a cuchillo",
    price: 3.50,
    category: "Empanadas",
    image: "https://resizer.glanacion.com/resizer/v2/empanadas-ZEMLUTI4JVFPZIMJM4V3UYB2B4.jpg?auth=0c3bb9643da3f4d5653af6d36a0cbe6095da18ec28d2c6f904f9a4feac7e880b&width=1200&height=780&quality=70&smart=true",
    popular: true,
    isDrink: false
  },
  {
    id: 21,
    name: "Empanada de Pollo",
    description: "Pollo con verduras",
    price: 3.50,
    category: "Empanadas",
    image: "https://cdn0.recetasgratis.net/es/posts/1/5/1/empanada_tucumana_37151_orig.jpg",
    popular: true,
    isDrink: false
  },
  {
    id: 22,
    name: "Sfijas",
    description: "Especialidad árabe",
    price: 4.00,
    category: "Empanadas",
    image: "https://img-global.cpcdn.com/recipes/bcc360a45212e9ec/400x400cq80/photo.jpg",
    popular: false,
    isDrink: false
  }
];

// ======================
// ESTADO DEL SISTEMA
// ======================
const state = {
  tables: {},
  calls: [],
  orders: [],
  bills: []
};

// Inicializar 10 mesas
for (let i = 1; i <= 10; i++) {
  state.tables[i] = {
    id: i,
    pendingCart: [],
    servedItems: [],
    split: false,
    people: [],
    status: 'available',
    currentTotal: 0,
    lastActivity: new Date(),
    consumptionByPerson: {},
    timestamps: {
      lastOrder: null,
      lastCall: null,
      lastBillRequest: null,
      lastServed: null
    }
  };
}

// ======================
// FUNCIONES DE PERSISTENCIA
// ======================
function saveStateToDisk() {
  try {
    const stateToSave = {
      tables: state.tables,
      calls: state.calls.filter(c => c.status === 'waiting'),
      orders: state.orders.filter(o => o.status === 'pending'),
      bills: state.bills.filter(b => b.status === 'pending'),
      lastBackup: new Date().toISOString()
    };
    
    fs.writeFileSync(STATE_BACKUP_FILE, JSON.stringify(stateToSave, null, 2));
    console.log('💾 Estado guardado en disco:', new Date().toLocaleTimeString());
  } catch (err) {
    console.error('Error guardando estado:', err);
  }
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(STATE_BACKUP_FILE)) {
      const data = fs.readFileSync(STATE_BACKUP_FILE, 'utf8');
      const savedState = JSON.parse(data);
      
      // Restaurar mesas
      if (savedState.tables) {
        Object.keys(savedState.tables).forEach(key => {
          if (state.tables[key]) {
            // Restaurar solo los datos activos, mantener estructura
            state.tables[key].pendingCart = savedState.tables[key].pendingCart || [];
            state.tables[key].servedItems = savedState.tables[key].servedItems || [];
            state.tables[key].split = savedState.tables[key].split || false;
            state.tables[key].people = savedState.tables[key].people || [];
            state.tables[key].status = savedState.tables[key].status || 'available';
            state.tables[key].currentTotal = savedState.tables[key].currentTotal || 0;
            state.tables[key].consumptionByPerson = savedState.tables[key].consumptionByPerson || {};
            
            // Restaurar timestamps como objetos Date
            if (savedState.tables[key].lastActivity) {
              state.tables[key].lastActivity = new Date(savedState.tables[key].lastActivity);
            }
          }
        });
      }
      
      // Restaurar calls activos
      if (savedState.calls) {
        state.calls = savedState.calls.map(call => ({
          ...call,
          time: new Date(call.time),
          lastBackup: call.lastBackup ? new Date(call.lastBackup) : undefined
        }));
      }
      
      // Restaurar orders activos
      if (savedState.orders) {
        state.orders = savedState.orders.map(order => ({
          ...order,
          createdAt: new Date(order.createdAt)
        }));
      }
      
      // Restaurar bills activos
      if (savedState.bills) {
        state.bills = savedState.bills.map(bill => ({
          ...bill,
          requestedAt: new Date(bill.requestedAt)
        }));
      }
      
      console.log('📂 Estado restaurado desde disco:', new Date().toLocaleTimeString());
      console.log(`   - ${state.calls.length} llamadas activas`);
      console.log(`   - ${state.orders.length} pedidos pendientes`);
      console.log(`   - ${state.bills.length} cuentas pendientes`);
    }
  } catch (err) {
    console.error('Error cargando estado:', err);
  }
}

// ======================
// FUNCIONES UTILES
// ======================
function calculateTotal(items) {
  return parseFloat(items.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    const quantity = parseInt(item.quantity) || 0;
    return sum + (price * quantity);
  }, 0).toFixed(2));
}

function notifyAdmins(event, data) {
  io.to('admin-room').emit(event, data);
}

function calculateConsumptionByPerson(table) {
  const consumption = {};
  
  table.servedItems.forEach(item => {
    const person = item.person || 'Todos';
    const itemTotal = (item.price || 0) * (item.quantity || 0);
    consumption[person] = (consumption[person] || 0) + itemTotal;
  });
  
  table.pendingCart.forEach(item => {
    const person = item.person || 'Todos';
    const itemTotal = (item.price || 0) * (item.quantity || 0);
    consumption[person] = (consumption[person] || 0) + itemTotal;
  });
  
  return consumption;
}

// FUNCIÓN FORMAT TIME CORREGIDA (USA getLocalTime)
function formatTime(date) {
  return getLocalTime(date);
}

function calculateElapsedTime(startTime) {
  if (!startTime) return '0s';
  
  const now = new Date();
  const start = new Date(startTime);
  const diffMs = now - start;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  
  if (diffSec < 60) {
    return `${diffSec}s`;
  } else if (diffMin < 60) {
    const remainingSec = diffSec % 60;
    return `${diffMin}m ${remainingSec}s`;
  } else {
    const diffHour = Math.floor(diffMin / 60);
    const remainingMin = diffMin % 60;
    return `${diffHour}h ${remainingMin}m`;
  }
}

// ======================
// KEEP-ALIVE PARA RENDER
// ======================
function startKeepAlive() {
  // Hacer ping a sí mismo cada 10 minutos
  setInterval(() => {
    const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://bar-irlanda-backend.onrender.com';
    
    if (renderUrl) {
      const url = `${renderUrl}/api/health`;
      console.log('🏓 Enviando keep-alive a:', url);
      
      https.get(url, (res) => {
        console.log('✅ Keep-alive respuesta:', res.statusCode);
      }).on('error', (err) => {
        console.error('❌ Keep-alive error:', err.message);
      });
    }
  }, 600000); // 10 minutos
}

// ======================
// CONFIGURACIÓN EXPRESS ROUTES
// ======================
app.get('/api/menu', (req, res) => {
  res.json(menu);
});

app.get('/api/state', (req, res) => {
  res.json({
    activeCalls: state.calls.filter(c => c.status === 'waiting'),
    activeOrders: state.orders.filter(o => o.status === 'pending'),
    activeBills: state.bills.filter(b => b.status === 'pending'),
    tables: Object.values(state.tables)
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Bar Irlanda Backend funcionando',
    timestamp: new Date().toISOString(),
    stats: {
      calls: state.calls.length,
      orders: state.orders.length,
      bills: state.bills.length,
      tables: Object.values(state.tables).filter(t => t.status !== 'available').length
    },
    cors: 'Configurado correctamente'
  });
});

// ======================
// SOCKET.IO - EVENTOS
// ======================
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id, new Date().toLocaleTimeString());
  
  // Ping mejorado
  socket.on('ping', () => {
    socket.emit('pong', { 
      serverTime: Date.now(),
      message: 'pong'
    });
    socket.lastPing = Date.now();
  });

  // Verificación de salud de conexiones
  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`, new Date().toLocaleTimeString());
  });

  // ====================================
  // 1. CLIENTE SE CONECTA A UNA MESA
  // ====================================
  socket.on('join-table', (tableId) => {
    const mesa = parseInt(tableId);
    
    if (mesa < 1 || mesa > 10) {
      socket.emit('error', {message: 'Mesa inválida (1-10)'});
      return;
    }
    
    socket.join(`mesa-${mesa}`);
    socket.tableId = mesa;
    
    const table = state.tables[mesa];
    
    // Limpiar mesa si estaba pagada pero ocupada
    if (table.status === 'paid_but_occupied') {
      table.pendingCart = [];
      table.servedItems = [];
      table.currentTotal = 0;
      table.consumptionByPerson = {};
      table.split = false;
      table.people = [];
      table.timestamps = {
        lastOrder: null,
        lastCall: null,
        lastBillRequest: null,
        lastServed: null
      };
      table.status = 'active';
    }
    
    table.lastActivity = new Date();
    
    socket.emit('table-connected', {
      tableId: mesa,
      tableState: {
        pendingCart: table.pendingCart,
        servedItems: table.servedItems,
        split: table.split,
        people: table.people,
        currentTotal: table.currentTotal,
        consumptionByPerson: table.consumptionByPerson,
        status: table.status
      }
    });
    
    notifyAdmins('table-updated', table);
  });
  
  // ====================================
  // 2. TIPO DE CUENTA
  // ====================================
  socket.on('set-bill-type', (data) => {
    const tableId = socket.tableId;
    if (!tableId) return;
    
    const table = state.tables[tableId];
    table.split = data.split;
    table.people = data.people || [];
    table.consumptionByPerson = calculateConsumptionByPerson(table);
    
    socket.emit('bill-type-set', {
      split: table.split,
      people: table.people,
      consumptionByPerson: table.consumptionByPerson
    });
    
    notifyAdmins('table-updated', table);
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // 3. AGREGAR AL CARRITO
  // ====================================
  socket.on('add-to-cart', (data) => {
    const tableId = socket.tableId;
    if (!tableId) return;
    
    const table = state.tables[tableId];
    const product = menu.find(p => p.id === data.productId);
    
    if (!product) return;
    
    let personName = 'Todos';
    if (table.split && data.personIndex !== undefined && table.people[data.personIndex]) {
      personName = table.people[data.personIndex];
    }
    
    const cartItem = {
      id: Date.now(),
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: data.quantity || 1,
      notes: data.notes || '',
      person: personName,
      addedAt: new Date(),
      addedAtFormatted: formatTime(new Date()),
      status: 'pending'
    };
    
    table.pendingCart.push(cartItem);
    table.status = 'ordering';
    table.lastActivity = new Date();
    
    if (table.split) {
      const itemTotal = product.price * (data.quantity || 1);
      table.consumptionByPerson[personName] = (table.consumptionByPerson[personName] || 0) + itemTotal;
    }
    
    socket.emit('cart-updated', {
      pendingCart: table.pendingCart,
      servedItems: table.servedItems,
      split: table.split,
      people: table.people,
      currentTotal: table.currentTotal,
      consumptionByPerson: table.consumptionByPerson,
      status: table.status
    });
    
    notifyAdmins('table-updated', table);
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // 4. ELIMINAR DEL CARRITO
  // ====================================
  socket.on('remove-from-cart', (itemId) => {
    const tableId = socket.tableId;
    if (!tableId) return;
    
    const table = state.tables[tableId];
    const itemIndex = table.pendingCart.findIndex(item => item.id === itemId);
    
    if (itemIndex !== -1) {
      const removedItem = table.pendingCart[itemIndex];
      
      if (table.split) {
        const itemTotal = removedItem.price * removedItem.quantity;
        table.consumptionByPerson[removedItem.person] = 
          (table.consumptionByPerson[removedItem.person] || 0) - itemTotal;
      }
      
      table.pendingCart.splice(itemIndex, 1);
    }
    
    socket.emit('cart-updated', {
      pendingCart: table.pendingCart,
      servedItems: table.servedItems,
      split: table.split,
      people: table.people,
      currentTotal: table.currentTotal,
      consumptionByPerson: table.consumptionByPerson,
      status: table.status
    });
    
    if (table.pendingCart.length === 0 && table.servedItems.length === 0) {
      table.status = 'active';
    }
    
    notifyAdmins('table-updated', table);
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // 5. LLAMAR AL MOZO
  // ====================================
  socket.on('call-waiter', () => {
    const tableId = socket.tableId;
    if (!tableId) return;
    
    const table = state.tables[tableId];
    const callTime = new Date();
    
    const callId = Date.now();
    const call = {
      id: callId,
      tableId: tableId,
      reason: 'Atención requerida',
      time: callTime,
      timeFormatted: formatTime(callTime),
      elapsedTime: '0s',
      status: 'waiting',
      exactTimestamp: callTime.getTime()
    };
    
    table.timestamps.lastCall = callTime;
    table.lastActivity = callTime;
    
    state.calls.push(call);
    notifyAdmins('new-call', call);
    
    socket.emit('waiter-called', {
      message: '✅ Mozo notificado',
      callId: callId,
      time: formatTime(callTime)
    });
    
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // 6. ENVIAR PEDIDO
  // ====================================
  socket.on('place-order', () => {
    const tableId = socket.tableId;
    if (!tableId) return;
    
    const table = state.tables[tableId];
    
    if (table.pendingCart.length === 0) {
      socket.emit('error', {message: 'No hay productos para pedir'});
      return;
    }
    
    const orderTime = new Date();
    
    const orderId = Date.now();
    const order = {
      id: orderId,
      tableId: tableId,
      items: table.pendingCart.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        person: item.person,
        notes: item.notes,
        addedAtFormatted: item.addedAtFormatted
      })),
      total: calculateTotal(table.pendingCart),
      split: table.split,
      people: [...table.people],
      createdAt: orderTime,
      createdAtFormatted: formatTime(orderTime),
      elapsedTime: '0s',
      status: 'pending',
      exactTimestamp: orderTime.getTime()
    };
    
    table.timestamps.lastOrder = orderTime;
    table.status = 'waiting';
    table.lastActivity = orderTime;
    
    state.orders.push(order);
    notifyAdmins('new-order', order);
    
    socket.emit('order-confirmed', {
      orderId: orderId,
      message: 'Pedido enviado a la barra',
      time: formatTime(orderTime)
    });
    
    notifyAdmins('table-updated', table);
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // 7. PEDIR LA CUENTA
  // ====================================
  socket.on('request-bill', () => {
    const tableId = socket.tableId;
    if (!tableId) return;
    
    const table = state.tables[tableId];
    const billTime = new Date();
    
    const allItems = [
      ...table.servedItems,
      ...table.pendingCart
    ];
    
    const total = calculateTotal(allItems);
    const billId = Date.now();
    
    const formattedItems = allItems.map(item => ({
      name: item.name,
      quantity: parseInt(item.quantity) || 1,
      price: parseFloat(item.price) || 0,
      person: item.person || 'Todos',
      status: item.status || 'served',
      subtotal: (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1),
      timeAdded: item.addedAtFormatted || formatTime(item.addedAt || new Date())
    }));
    
    const bill = {
      id: billId,
      tableId: tableId,
      items: formattedItems,
      total: parseFloat(total.toFixed(2)),
      split: table.split,
      people: [...table.people],
      currentTotal: table.currentTotal,
      consumptionByPerson: table.consumptionByPerson,
      requestedAt: billTime,
      requestedAtFormatted: formatTime(billTime),
      elapsedTime: '0s',
      status: 'pending',
      exactTimestamp: billTime.getTime()
    };
    
    if (table.split && table.people.length > 0 && allItems.length > 0) {
      bill.perPerson = {};
      table.people.forEach(person => {
        const personItems = allItems.filter(item => item.person === person);
        bill.perPerson[person] = calculateTotal(personItems);
      });
    }
    
    table.timestamps.lastBillRequest = billTime;
    table.status = 'paying';
    table.lastActivity = billTime;
    
    state.bills.push(bill);
    notifyAdmins('bill-requested', bill);
    
    const message = `✅ Cuenta solicitada: $${total.toFixed(2)}`;
    
    socket.emit('bill-prepared', {
      ...bill,
      message: message
    });
    
    notifyAdmins('table-updated', table);
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // 8. ACTUALIZAR TIEMPOS TRANSCURRIDOS
  // ====================================
  function updateElapsedTimes() {
    const now = new Date();
    
    state.calls.forEach(call => {
      if (call.status === 'waiting') {
        call.elapsedTime = calculateElapsedTime(call.time);
      }
    });
    
    state.orders.forEach(order => {
      if (order.status === 'pending') {
        order.elapsedTime = calculateElapsedTime(order.createdAt);
      }
    });
    
    state.bills.forEach(bill => {
      if (bill.status === 'pending') {
        bill.elapsedTime = calculateElapsedTime(bill.requestedAt);
      }
    });
    
    io.to('admin-room').emit('times-updated', {
      calls: state.calls.filter(c => c.status === 'waiting'),
      orders: state.orders.filter(o => o.status === 'pending'),
      bills: state.bills.filter(b => b.status === 'pending')
    });
  }
  
  setInterval(updateElapsedTimes, 10000);
  
  // ====================================
  // PANEL DE ADMINISTRACIÓN
  // ====================================
  socket.on('join-as-admin', (password) => {
    if (password === 'admin123') {
      socket.join('admin-room');
      socket.role = 'admin';
      
      updateElapsedTimes();
      
      socket.emit('admin-connected', {
        calls: state.calls.filter(c => c.status === 'waiting'),
        orders: state.orders.filter(o => o.status === 'pending'),
        bills: state.bills.filter(b => b.status === 'pending'),
        tables: Object.values(state.tables)
      });
    }
  });
  
  socket.on('attend-call', (callId) => {
    const call = state.calls.find(c => c.id === callId);
    if (call) {
      call.status = 'attended';
      call.attendedAt = new Date();
      call.attendedAtFormatted = formatTime(new Date());
      
      const table = state.tables[call.tableId];
      table.lastActivity = new Date();
      
      notifyAdmins('call-attended', callId);
      io.to(`mesa-${call.tableId}`).emit('waiter-arriving');
    }
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  socket.on('mark-order-served', (orderId) => {
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
      order.status = 'served';
      const serveTime = new Date();
      order.servedAt = serveTime;
      order.servedAtFormatted = formatTime(serveTime);
      
      const table = state.tables[order.tableId];
      const servedItems = [];
      
      order.items.forEach(orderItem => {
        const pendingIndex = table.pendingCart.findIndex(item => item.id === orderItem.id);
        if (pendingIndex !== -1) {
          const pendingItem = table.pendingCart[pendingIndex];
          const servedItem = { 
            ...pendingItem, 
            status: 'served',
            servedAt: serveTime,
            servedAtFormatted: formatTime(serveTime)
          };
          
          table.servedItems.push(servedItem);
          servedItems.push(servedItem);
          
          const itemTotal = parseFloat(servedItem.price) * parseInt(servedItem.quantity);
          table.currentTotal += itemTotal;
          
          table.pendingCart.splice(pendingIndex, 1);
        }
      });
      
      table.timestamps.lastServed = serveTime;
      if (table.pendingCart.length === 0) {
        table.status = 'active';
      }
      
      table.consumptionByPerson = calculateConsumptionByPerson(table);
      table.lastActivity = serveTime;
      
      io.to(`mesa-${table.id}`).emit('items-served', {
        items: servedItems,
        currentTotal: table.currentTotal,
        consumptionByPerson: table.consumptionByPerson,
        serveTime: formatTime(serveTime)
      });
      
      io.to(`mesa-${table.id}`).emit('cart-updated', {
        pendingCart: table.pendingCart,
        servedItems: table.servedItems,
        split: table.split,
        people: table.people,
        currentTotal: table.currentTotal,
        consumptionByPerson: table.consumptionByPerson,
        status: table.status
      });
      
      notifyAdmins('order-served', {
        orderId: orderId,
        tableId: table.id,
        servedItems: servedItems,
        serveTime: formatTime(serveTime)
      });
      
      notifyAdmins('table-updated', table);
    }
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // ADMIN: Marcar cuenta como PAGADA
  // ====================================
  socket.on('mark-bill-paid', (billId) => {
    const bill = state.bills.find(b => b.id === billId);
    if (bill) {
      const paidTime = new Date();
      bill.status = 'paid';
      bill.paidAt = paidTime;
      bill.paidAtFormatted = formatTime(paidTime);
      
      const table = state.tables[bill.tableId];
      if (table) {
        table.status = 'paid_but_occupied';
        table.lastActivity = paidTime;
        
        io.to(`mesa-${table.id}`).emit('bill-paid', {
          message: '✅ Pago confirmado - ¡Gracias!',
          finalTotal: bill.total,
          paidTime: formatTime(paidTime)
        });
        
        io.to(`mesa-${table.id}`).emit('cart-updated', {
          pendingCart: table.pendingCart,
          servedItems: table.servedItems,
          split: table.split,
          people: table.people,
          currentTotal: table.currentTotal,
          consumptionByPerson: table.consumptionByPerson,
          status: 'paid_but_occupied'
        });
        
        notifyAdmins('table-updated', table);
      }
      
      notifyAdmins('bill-paid', billId);
    }
    saveStateToDisk(); // Guardar después de cambios importantes
  });
  
  // ====================================
  // ADMIN: LIBERAR MESA
  // ====================================
  socket.on('free-table', (tableId) => {
    const table = state.tables[tableId];
    if (table) {
      const freeTime = new Date();
      
      table.pendingCart = [];
      table.servedItems = [];
      table.currentTotal = 0;
      table.consumptionByPerson = {};
      table.status = 'available';
      table.split = false;
      table.people = [];
      table.lastActivity = freeTime;
      
      table.timestamps = {
        lastOrder: null,
        lastCall: null,
        lastBillRequest: null,
        lastServed: null
      };
      
      io.to(`mesa-${table.id}`).emit('table-freed', {
        message: 'Mesa liberada - ¡Hasta la próxima!'
      });
      
      io.to(`mesa-${table.id}`).emit('cart-updated', {
        pendingCart: [],
        servedItems: [],
        split: false,
        people: [],
        currentTotal: 0,
        consumptionByPerson: {},
        status: 'available'
      });
      
      io.to(`mesa-${table.id}`).emit('reset-to-bill-selection');
      
      notifyAdmins('table-freed', table);
    }
    saveStateToDisk(); // Guardar después de cambios importantes
  });
});

// ======================
// VERIFICACIÓN PERIÓDICA DE SALUD
// ======================
setInterval(() => {
  const now = Date.now();
  io.sockets.sockets.forEach((socket) => {
    if (socket.lastPing && now - socket.lastPing > 300000) { // 5 minutos sin ping
      console.log('⚠️ Cliente inactivo, desconectando:', socket.id);
      socket.disconnect(true);
    }
  });
}, 60000);

// ======================
// GUARDADO AUTOMÁTICO CADA MINUTO
// ======================
setInterval(saveStateToDisk, BACKUP_INTERVAL);

// ======================
// CARGAR ESTADO AL INICIAR
// ======================
loadStateFromDisk();

// ======================
// INICIAR KEEP-ALIVE
// ======================
startKeepAlive();

// ======================
// INICIAR SERVIDOR
// ======================
const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {
  console.log(`
=========================================
      🍀 BAR IRLANDA PUB 🍀
  Sistema con Persistencia para Render
=========================================
✅ Servidor en: http://localhost:${PORT}
⏰ Iniciado: ${new Date().toLocaleString()}
💾 Backup automático cada minuto
🏓 Keep-alive cada 10 minutos
🇦🇷 Hora Argentina forzada

📱 Cliente:   http://localhost:${PORT}/cliente.html?mesa=1
👨‍💼 Admin:     http://localhost:${PORT}/admin.html
   Contraseña: admin123
=========================================
  `);
});