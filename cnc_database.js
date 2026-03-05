const DB_KEY = 'cnc_database';
const DB_CACHE_KEY = 'cnc_db_cache_v2';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

let currentBuilder = '';
let currentModel = '';
let deleteCallback = null;
let database = {};

// Add this function to force reload from JSON
function forceReloadDatabase() {
  showDeleteModal(
    'Reload Database from JSON?',
    'This will:<br><br>' +
    '• Clear the cache and reload fresh data from machine_data.json<br>' +
    '• Keep your custom changes (they will be merged back)<br>' +
    '• Update with any new data in the JSON file<br><br>' +
    'Are you sure?',
    performForceReload
  );
}

function performForceReload() {
  // Show loading indicator
  showSaveIndicator('Reloading from JSON file...');
  
  // Clear the cache
  localStorage.removeItem(DB_CACHE_KEY);
  
  // Reload the database
  loadDatabase().then(() => {
    showSaveIndicator('Database reloaded from JSON');
  }).catch(error => {
    console.error('Error reloading:', error);
    showSaveIndicator('Error reloading database');
  });
}




// Add this function to reset all data
function resetAllToDefault() {
  showDeleteModal(
    'Reset All Data to Default?',
    'This will delete ALL your customizations including:<br><br>' +
    '• Custom builders you added<br>' +
    '• Custom models you added<br>' +
    '• Edited specifications<br>' +
    '• Uploaded photos<br><br>' +
    'This action cannot be undone!',
    performResetAll
  );
}

function performResetAll() {
  // Clear all localStorage
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(DB_CACHE_KEY);
  
  // Reload the page
  location.reload();
}


// Helper: Get the logo path for a builder
function getBuilderLogoPath(builder) {
  const logoMap = {
    'DMG': 'images/logo-dmg.webp',
    'Mazak': 'images/logo-mazak.webp',
    'Fanuc': 'images/logo-fanuc.webp',
    'Ares Seiki': 'images/logo-ares-seiki.webp',
    'Doosan': 'images/logo-doosan.webp',
    'Hartford': 'images/logo-hartford.webp',
    'Hwacheon': 'images/logo-hwacheon.webp',
    'TongTai': 'images/logo-tongtai.webp',
    'UGINT': 'images/logo-ugint.webp',
    'Tornos': 'images/logo-tornos.webp',
    'Victor Taichung': 'images/logo-victor.webp',
    'FFG DMC': 'images/logo-ffg-dmc.webp'
  };
  
  // Check predefined logos first
  if (logoMap[builder]) {
    return logoMap[builder];
  }
  
  // Check if builder has custom logo stored in database
  if (database[builder] && database[builder].logo) {
    return database[builder].logo;
  }
  
  return ''; // No logo available
}


// Helper: Get the default local image path for a machine
function getDefaultImagePath(builder, model) {
  const defaults = {
    Mazak: {
      "VRX i500": "images/vrx-i500.webp",
      "VRX730": "images/vrx730.webp",
      "VCN530C": "images/vcn530c.webp",
      "Integrex i-400": "images/integrex-i400.webp",
      "Variaxis i-800": "images/variaxis-i800.webp"
    },
    DMG: {
      "DMU65": "images/dmu65.webp",
      "DMU95": "images/dmu95.webp",
      "NVX5100": "images/nvx5100.webp",
      "DMU50": "images/dmu50.webp"
    },
    Fanuc: {
      "Robodrill α-D21LiB5": "images/robodrill-d21lib5.webp",
      "Robocut α-C600iB": "images/robocut-c600ib.webp"
    },
    'Ares Seiki': {
      "AF5040": "images/af5040.webp"
    },
    'Doosan': {
      "DNM500HS": "images/dnm500hs.webp",
      "DNM750L": "images/dnm750l.webp",
      "MYNX9500": "images/mynx9500.webp"
    },
    'Hartford': {
      "Aero-426": "images/aero-426.webp"
    },
    'Hwacheon': {
      "Sirius 650": "images/sirius-650.webp"
    },
    'TongTai': {
      "TMV1600": "images/tmv1600.webp"
    },
    'UGINT': {
      "UM 500DH": "images/um-500dh.webp"
    },
    'Tornos': {
      "Swiss DecoT": "images/swiss-decoto.webp"
    },
    'Victor Taichung': {
      "Vturn": "images/vturn.webp"
    },
    'FFG DMC': {  // Add this section
      "DVD5200": "images/dvd5200.webp"
    }
  };
  
  return defaults[builder]?.[model] || '';
}



// ========== OPTIMIZED DATA LOADING ==========

// Load database with caching and single JSON file
async function loadDatabase() {
  try {
    // Show loading indicator
    showSaveIndicator('Loading database...');
    
    // 1. CHECK CACHE FIRST
    const cached = localStorage.getItem(DB_CACHE_KEY);
    if (cached) {
      const { data, timestamp, version } = JSON.parse(cached);
      
      // Check if cache is still valid (less than 24 hours old)
      if (Date.now() - timestamp < CACHE_EXPIRY) {
        console.log('Using cached database');
        database = data;
        initializeFromDatabase();
        return;
      } else {
        console.log('Cache expired, fetching fresh data');
      }
    }
    
    // 2. LOAD FROM SINGLE JSON FILE
    console.log('Fetching from single JSON file...');
    const startTime = performance.now();
    
    // Load the single combined JSON file
    const response = await fetch('machine_data.json');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    const loadTime = performance.now() - startTime;
    console.log(`Loaded ${Object.keys(data).length} builders in ${loadTime.toFixed(0)}ms`);
    
    // 3. PROCESS THE DATA
    database = data;
    
    // 4. CACHE THE DATA
    localStorage.setItem(DB_CACHE_KEY, JSON.stringify({
      data: database,
      timestamp: Date.now(),
      version: '2.0'
    }));
    
    // 5. LOAD USER MODIFICATIONS
    loadUserModifications();
    
    // 6. INITIALIZE UI
    initializeFromDatabase();
    
  } catch (error) {
    console.error('Error loading database:', error);
    
    // Try to use cache even if expired
    const cached = localStorage.getItem(DB_CACHE_KEY);
    if (cached) {
      console.log('Using expired cache as fallback');
      const { data } = JSON.parse(cached);
      database = data;
      initializeFromDatabase();
    } else {
      // Last resort: use hardcoded defaults
      console.log('Using hardcoded defaults');
      initializeWithDefaultBuilders();
    }
  }
}

// Load user modifications from localStorage
function loadUserModifications() {
  if (!localStorage.getItem(DB_KEY)) return;
  
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY));
    
    Object.keys(saved).forEach(builder => {
      // If builder doesn't exist in database, add it (custom builder)
      if (!database[builder]) {
        database[builder] = saved[builder];
        return;
      }
      
      // Load custom logo
      if (saved[builder].logo) {
        database[builder].logo = saved[builder].logo;
      }
      
      // Merge models
      if (saved[builder].models) {
        database[builder].models = [
          ...new Set([...database[builder].models, ...saved[builder].models])
        ].sort();
      }
      
      // Merge specs
      Object.keys(saved[builder].specs || {}).forEach(model => {
        if (!database[builder].specs[model]) {
          database[builder].specs[model] = { image: '', data: {} };
        }
        
        const savedSpec = saved[builder].specs[model];
        
        // Update image if exists
        if (savedSpec.image) {
          database[builder].specs[model].image = savedSpec.image;
        }
        
        // Update data
        if (savedSpec.data) {
          database[builder].specs[model].data = {
            ...database[builder].specs[model].data,
            ...savedSpec.data
          };
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading user modifications:', error);
  }
}

// Initialize UI after database is loaded
function initializeFromDatabase() {
  populateBuilders();
  showBuilders();
  setupModalEvents();
  
  // Lazy load images for visible builder cards
  setTimeout(() => {
    lazyLoadBuilderLogos();
  }, 100);
  
  // Show success message
  setTimeout(() => {
    showSaveIndicator('Database loaded');
  }, 500);
}


// Lazy load model images
function lazyLoadModelImages() {
  // Check if IntersectionObserver is supported
  if (!('IntersectionObserver' in window)) {
    // Fallback: load all images immediately
    document.querySelectorAll('.model-model-image[data-src]').forEach(img => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    });
    return;
  }
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img && img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '100px' // Start loading 100px before element enters viewport
  });
  
  // Observe all model card images
  document.querySelectorAll('.model-model-image[data-src]').forEach(img => {
    observer.observe(img);
  });
}

// Lazy load builder logos
function lazyLoadBuilderLogos() {
  // Check if IntersectionObserver is supported
  if (!('IntersectionObserver' in window)) {
    // Fallback: load all images immediately
    document.querySelectorAll('.builder-logo[data-src]').forEach(img => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    });
    return;
  }
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target.querySelector('.builder-logo');
        if (img && img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        observer.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: '100px' // Start loading 100px before element enters viewport
  });
  
  // Observe all builder cards
  document.querySelectorAll('.card').forEach(card => {
    observer.observe(card);
  });
}

// ========== FALLBACK FUNCTIONS ==========

function initializeWithDefaultBuilders() {
  database = {
    Mazak: { models: ["VRX i500", "VRX730", "VCN530C", "Integrex i-400", "Variaxis i-800"], specs: {} },
    DMG: { models: ["DMU65", "DMU95", "NVX5100", "DMU50"], specs: {} },
    Fanuc: { models: ["Robodrill α-D21LiB5", "Robocut α-C600iB"], specs: {} },
    'Ares Seiki': { models: ["AF5040"], specs: {} },
    'Doosan': { models: ["DNM500HS", "DNM750L", "MYNX9500"], specs: {} },
    'Hartford': { models: ["Aero-426"], specs: {} },
    'Hwacheon': { models: ["Sirius 650"], specs: {} },
    'TongTai': { models: ["TMV1600"], specs: {} },
    'UGINT': { models: ["UM 500DH"], specs: {} },
    'Tornos': { models: ["Swiss DecoT"], specs: {} },
    'Victor Taichung': { models: ["Vturn"], specs: {} },
    'FFG DMC': { models: ["DVD5200"], specs: {} }  // Add this line
  };
  
  initializeFromDatabase();
}

// ========== SAVE FUNCTIONS ==========

function saveDatabase() {
  const saved = {};
  
  Object.keys(database).forEach(builder => {
    saved[builder] = {
      models: database[builder].models || [],
      specs: {},
      logo: database[builder].logo || '' // Save custom logo
    };
    
    // Only save specs that have modifications
    Object.keys(database[builder].specs || {}).forEach(model => {
      const spec = database[builder].specs[model];
      const originalData = getOriginalDataFromJSON(builder, model);
      
      // Check for modifications
      const hasImageMod = spec.image && spec.image.startsWith('data:image');
      const hasDataMod = !isDataEqual(originalData, spec.data);
      const isCustomModel = !originalData || Object.keys(originalData).length === 0;
      
      if (hasImageMod || hasDataMod || isCustomModel) {
        saved[builder].specs[model] = {};
        if (spec.image) saved[builder].specs[model].image = spec.image;
        if (spec.data) saved[builder].specs[model].data = spec.data;
      }
    });
  });
  
  localStorage.setItem(DB_KEY, JSON.stringify(saved));
  showSaveIndicator('Changes saved');
}




function isDataEqual(original, current) {
  if (!original && !current) return true;
  if (!original || !current) return false;
  
  const originalKeys = Object.keys(original);
  const currentKeys = Object.keys(current);
  
  if (originalKeys.length !== currentKeys.length) return false;
  
  for (const key of originalKeys) {
    if (original[key] !== current[key]) return false;
  }
  
  return true;
}

function getOriginalDataFromJSON(builder, model) {
  // This would check the original JSON data
  // For now, return empty (we're caching everything)
  return database[builder]?.specs[model]?.data || {};
}

// ========== NAVIGATION FUNCTIONS ==========

function showBuilders() {
  document.getElementById('builders-page').style.display = 'block';
  document.getElementById('models-page').style.display = 'none';
  document.getElementById('detail-page').style.display = 'none';
  
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
  
  populateBuilders();
  
  // Lazy load images again when showing builders
  setTimeout(lazyLoadBuilderLogos, 100);
  
  // Update browser history
  const currentState = history.state;
  if (!currentState || currentState.page !== 'builders') {
    history.pushState({ page: 'builders' }, 'Builders', '#builders');
  }
}

function showModels(builder) {
  currentBuilder = builder;
  document.getElementById('current-builder').textContent = builder;
  document.getElementById('builders-page').style.display = 'none';
  document.getElementById('models-page').style.display = 'block';
  document.getElementById('detail-page').style.display = 'none';
  
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  populateModels(builder);
  
  // Update browser history
  const currentState = history.state;
  if (!currentState || currentState.page !== 'models' || currentState.builder !== builder) {
    history.pushState({ 
      page: 'models', 
      builder: builder 
    }, `${builder} Models`, `#${encodeURIComponent(builder)}`);
  }
}

function showDetail(builder, model) {
  currentBuilder = builder;
  currentModel = model;
  
  document.getElementById('current-model').textContent = model;
  document.getElementById('builders-page').style.display = 'none';
  document.getElementById('models-page').style.display = 'none';
  document.getElementById('detail-page').style.display = 'block';
  
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  if (!database[builder].specs[model]) {
    database[builder].specs[model] = { image: '', data: {} };
  }
  const specs = database[builder].specs[model];

  // Setup image with lazy loading
  const img = document.getElementById('machine-image');
  const imagePath = specs.image || getDefaultImagePath(builder, model);
  
  if (imagePath) {
    // Use a placeholder while loading
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyMCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvYWRpbmcgaW1hZ2UuLi48L3RleHQ+PC9zdmc+';
    
    // Lazy load the actual image
    const lazyImage = new Image();
    lazyImage.onload = () => {
      img.src = imagePath;
    };
    lazyImage.onerror = () => {
      // If image fails to load, show a broken image placeholder
      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmVmM2YzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iI2U3NGMzYyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
    };
    lazyImage.src = imagePath;
  } else {
    img.src = '';
  }

  // Render table
  renderSpecsTable(builder, model, specs);
  
  // Setup buttons
  setupImageUpload(builder, model, img, specs);
  setupResetPhotoButton(builder, model, img, specs);
  setupResetDataButton(builder, model);
  setupDeleteModelButton(builder, model);
  setupAddSpecButton(builder, model);
  
  // Update browser history
  const currentState = history.state;
  if (!currentState || currentState.page !== 'detail' || 
      currentState.builder !== builder || currentState.model !== model) {
    history.pushState({ 
      page: 'detail', 
      builder: builder, 
      model: model 
    }, `${builder} - ${model}`, 
    `#${encodeURIComponent(builder)}/${encodeURIComponent(model)}`);
  }
}

// ========== BUILDER MANAGEMENT ==========

function renumberSidebar() {
  const listItems = document.querySelectorAll('.builder-list li');
  const cards = document.querySelectorAll('.card h3');
  
  // Renumber sidebar
  listItems.forEach((li, index) => {
    const numberElement = li.querySelector('.builder-number');
    if (numberElement) {
      numberElement.textContent = `${index + 1}.`;
    }
  });
  
  // Renumber cards
  cards.forEach((card, index) => {
    const numberElement = card.querySelector('.card-number');
    if (numberElement) {
      numberElement.textContent = `${index + 1}.`;
    }
  });
}


function populateBuilders(onlyNewBuilder = null) {
  const grid = document.getElementById('builders-grid');
  const list = document.getElementById('builder-list');
  
  if (!grid || !list) return;
  
  // Only update the sidebar list completely
  list.innerHTML = '';

  // Sort builders and add numbering
  const sortedBuilders = Object.keys(database).sort();
  
  // Update sidebar
  sortedBuilders.forEach((builder, index) => {
    const number = index + 1; // Start from 1
    
    // Sidebar list
    const li = document.createElement('li');
    
    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="builder-number">${number}.</span> <span class="builder-name">${builder}</span>`;
    a.onclick = (e) => { e.preventDefault(); showModels(builder); };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-builder-btn';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.title = 'Delete builder';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      showDeleteModal(
        `Delete "${builder}"?`,
        `This will delete ${builder} and all ${database[builder].models.length} models.`,
        () => deleteBuilder(builder)
      );
    };
    
    li.appendChild(a);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
  
  // If onlyNewBuilder is provided, only add that one to the grid
  if (onlyNewBuilder) {
    // Find the new builder's position in sorted list
    const index = sortedBuilders.indexOf(onlyNewBuilder);
    if (index !== -1) {
      const number = index + 1;
      addBuilderCardToGrid(grid, onlyNewBuilder, number);
      
      // Re-number all cards to maintain correct numbering
      renumberBuilderCards();
    }
  } else {
    // Full grid refresh - clear and rebuild everything
    grid.innerHTML = '';
    
    sortedBuilders.forEach((builder, index) => {
      const number = index + 1; // Start from 1
      addBuilderCardToGrid(grid, builder, number);
    });
  }
  
  // Re-render numbering after update
  renumberSidebar();
  
  // Lazy load images for newly added cards
  setTimeout(() => {
    if (onlyNewBuilder) {
      // Only lazy load the new card
      const newCard = document.querySelector(`.card[data-builder="${onlyNewBuilder}"]`);
      if (newCard) {
        lazyLoadSingleBuilderLogo(newCard);
      }
    } else {
      // Lazy load all builder logos
      lazyLoadBuilderLogos();
    }
  }, 100);
}

// Helper function to add a builder card to the grid
function addBuilderCardToGrid(grid, builder, number) {
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('data-builder', builder); // Add data attribute for easier selection
  card.onclick = () => showModels(builder);
  
  // Get logo path
  const logoPath = getBuilderLogoPath(builder);
  
  const logoContainer = document.createElement('div');
  logoContainer.className = 'logo-area';
  
  if (logoPath) {
    const logoImg = document.createElement('img');
    logoImg.dataset.src = logoPath;
    logoImg.alt = `${builder} Logo`;
    logoImg.className = 'builder-logo';
    logoImg.loading = 'lazy';
    
    logoImg.onerror = function() {
      this.style.display = 'none';
      const defaultLogo = document.createElement('div');
      defaultLogo.className = 'default-logo';
      defaultLogo.textContent = builder.charAt(0);
      logoContainer.appendChild(defaultLogo);
    };
    
    logoContainer.appendChild(logoImg);
  } else {
    const defaultLogo = document.createElement('div');
    defaultLogo.className = 'default-logo';
    defaultLogo.textContent = builder.charAt(0);
    logoContainer.appendChild(defaultLogo);
  }
  
  card.appendChild(logoContainer);
  
  // Add builder name with number
  const nameElement = document.createElement('h3');
  nameElement.innerHTML = `<span class="card-number" data-builder="${builder}">${number}.</span> ${builder}`;
  card.appendChild(nameElement);
  
  // Add delete button
  const deleteCardBtn = document.createElement('button');
  deleteCardBtn.className = 'delete-model-btn';
  deleteCardBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteCardBtn.onclick = (e) => {
    e.stopPropagation();
    showDeleteModal(
      `Delete "${builder}"?`,
      `This will delete ${builder} and all ${database[builder].models.length} models.`,
      () => deleteBuilder(builder)
    );
  };
  
  card.appendChild(deleteCardBtn);
  grid.appendChild(card);
}

// Helper function to renumber all builder cards
function renumberBuilderCards() {
  const sortedBuilders = Object.keys(database).sort();
  
  sortedBuilders.forEach((builder, index) => {
    const number = index + 1;
    const numberElement = document.querySelector(`.card-number[data-builder="${builder}"]`);
    if (numberElement) {
      numberElement.textContent = `${number}.`;
    }
  });
}

// Helper function to lazy load a single builder logo
function lazyLoadSingleBuilderLogo(cardElement) {
  const img = cardElement.querySelector('.builder-logo[data-src]');
  if (img && img.dataset.src) {
    // Create a new Image object to preload
    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    };
    tempImg.onerror = () => {
      // If image fails to load, show default logo
      img.style.display = 'none';
      const defaultLogo = document.createElement('div');
      defaultLogo.className = 'default-logo';
      defaultLogo.textContent = cardElement.getAttribute('data-builder').charAt(0);
      cardElement.querySelector('.logo-area').appendChild(defaultLogo);
    };
    tempImg.src = img.dataset.src;
  }
}



// Alternative optimized version if you want minimal DOM updates:
function addNewBuilder(name, logoUrl = '') {
  if (!name.trim()) {
    alert('Builder name is required');
    return;
  }
  
  if (database[name]) {
    alert(`Builder "${name}" already exists`);
    return;
  }
  
  database[name] = {
    models: [],
    specs: {},
    logo: logoUrl.trim()
  };
  
  saveDatabase();
  
  // Get sorted builders including the new one
  const sortedBuilders = Object.keys(database).sort();
  const newIndex = sortedBuilders.indexOf(name);
  const number = newIndex + 1;
  
  // Update sidebar completely
  populateSidebarList();
  
  // Update grid with proper insertion
  updateGridWithNewBuilder(name, number, newIndex);
  
  showSaveIndicator(`Builder "${name}" added`);
}

function populateSidebarList() {
  const list = document.getElementById('builder-list');
  list.innerHTML = '';
  
  const sortedBuilders = Object.keys(database).sort();
  
  sortedBuilders.forEach((builder, index) => {
    const number = index + 1;
    
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="builder-number">${number}.</span> <span class="builder-name">${builder}</span>`;
    a.onclick = (e) => { e.preventDefault(); showModels(builder); };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-builder-btn';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.title = 'Delete builder';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      showDeleteModal(
        `Delete "${builder}"?`,
        `This will delete ${builder} and all ${database[builder].models.length} models.`,
        () => deleteBuilder(builder)
      );
    };
    
    li.appendChild(a);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

function updateGridWithNewBuilder(builderName, number, insertIndex) {
  const grid = document.getElementById('builders-grid');
  const cards = grid.querySelectorAll('.card');
  
  // Create the new card
  const newCard = createBuilderCard(builderName, number);
  
  if (insertIndex >= cards.length) {
    // Append to end
    grid.appendChild(newCard);
  } else {
    // Insert at correct position
    const referenceCard = Array.from(cards)[insertIndex];
    grid.insertBefore(newCard, referenceCard);
    
    // Update numbers for all following cards
    updateCardNumbersFromIndex(insertIndex + 1);
  }
  
  // Lazy load the new card's logo
  setTimeout(() => {
    const img = newCard.querySelector('.builder-logo[data-src]');
    if (img && img.dataset.src) {
      const tempImg = new Image();
      tempImg.onload = () => {
        img.src = img.dataset.src;
        delete img.dataset.src;
      };
      tempImg.onerror = () => {
        img.style.display = 'none';
        const defaultLogo = document.createElement('div');
        defaultLogo.className = 'default-logo';
        defaultLogo.textContent = builderName.charAt(0);
        newCard.querySelector('.logo-area').appendChild(defaultLogo);
      };
      tempImg.src = img.dataset.src;
    }
  }, 100);
}

function createBuilderCard(builder, number) {
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('data-builder', builder);
  card.onclick = () => showModels(builder);
  
  const logoPath = getBuilderLogoPath(builder);
  const logoContainer = document.createElement('div');
  logoContainer.className = 'logo-area';
  
  if (logoPath) {
    const logoImg = document.createElement('img');
    logoImg.dataset.src = logoPath;
    logoImg.alt = `${builder} Logo`;
    logoImg.className = 'builder-logo';
    logoImg.loading = 'lazy';
    logoImg.onerror = function() {
      this.style.display = 'none';
      const defaultLogo = document.createElement('div');
      defaultLogo.className = 'default-logo';
      defaultLogo.textContent = builder.charAt(0);
      logoContainer.appendChild(defaultLogo);
    };
    logoContainer.appendChild(logoImg);
  } else {
    const defaultLogo = document.createElement('div');
    defaultLogo.className = 'default-logo';
    defaultLogo.textContent = builder.charAt(0);
    logoContainer.appendChild(defaultLogo);
  }
  
  card.appendChild(logoContainer);
  
  const nameElement = document.createElement('h3');
  nameElement.innerHTML = `<span class="card-number" data-builder="${builder}">${number}.</span> ${builder}`;
  card.appendChild(nameElement);
  
  const deleteCardBtn = document.createElement('button');
  deleteCardBtn.className = 'delete-model-btn';
  deleteCardBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteCardBtn.onclick = (e) => {
    e.stopPropagation();
    showDeleteModal(
      `Delete "${builder}"?`,
      `This will delete ${builder} and all ${database[builder].models.length} models.`,
      () => deleteBuilder(builder)
    );
  };
  
  card.appendChild(deleteCardBtn);
  return card;
}

function updateCardNumbersFromIndex(startIndex) {
  const cards = document.querySelectorAll('.card');
  const sortedBuilders = Object.keys(database).sort();
  
  for (let i = startIndex; i < cards.length; i++) {
    const card = cards[i];
    const builder = card.getAttribute('data-builder');
    const newIndex = sortedBuilders.indexOf(builder);
    if (newIndex !== -1) {
      const numberElement = card.querySelector('.card-number');
      if (numberElement) {
        numberElement.textContent = `${newIndex + 1}.`;
      }
    }
  }
}



function deleteBuilder(builderName) {
  if (!confirm(`Are you sure you want to delete "${builderName}" and all its models?`)) {
    return;
  }
  
  delete database[builderName];
  saveDatabase();
  populateBuilders(); // Full refresh needed when deleting
  showBuilders();
  showSaveIndicator(`Builder "${builderName}" deleted`);
}

// ========== MODEL MANAGEMENT ==========

function populateModels(builder) {
  const grid = document.getElementById('models-grid');
  grid.innerHTML = '';

  const models = database[builder].models || [];
  
  models.forEach(model => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => showDetail(builder, model);

    const specs = database[builder].specs[model] || { image: '' };
    
    // Get image path - use specs.image if available, otherwise use default image
    const imagePath = specs.image || getDefaultImagePath(builder, model);
    let imgHtml = '';
    
    if (imagePath) {
      // Use lazy loading for model images too
      imgHtml = `<img src="" data-src="${imagePath}" alt="${model}" class="model-model-image" loading="lazy">`;
    } else {
      imgHtml = `<div class="model-model-image" style="background: #f8f9fa; display: flex; align-items: center; justify-content: center; color: #666;">No Image</div>`;
    }
    
    card.innerHTML = `${imgHtml}<h3>${model}</h3>`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-model-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      showDeleteModal(
        `Delete "${model}"?`,
        `This will delete the ${model} model and all its specifications.`,
        () => deleteModel(builder, model)
      );
    };
    
    card.appendChild(deleteBtn);
    grid.appendChild(card);
  });
  
  // Lazy load model images after they're added to the DOM
  setTimeout(lazyLoadModelImages, 100);
}

function addNewModel(builder, modelName, imagePath) {
  if (!modelName.trim()) {
    alert('Model name is required');
    return;
  }
  
  if (!database[builder].models.includes(modelName)) {
    database[builder].models.push(modelName);
    database[builder].models.sort();
    
    if (!database[builder].specs[modelName]) {
      database[builder].specs[modelName] = {
        image: imagePath || '',
        data: {}
      };
    }
    
    saveDatabase();
    populateModels(builder);
    showSaveIndicator(`Model "${modelName}" added`);
  } else {
    alert(`Model "${modelName}" already exists`);
  }
}

function deleteModel(builder, modelName) {
  if (!confirm(`Are you sure you want to delete model "${modelName}"?`)) {
    return;
  }
  
  // Remove from models array
  const index = database[builder].models.indexOf(modelName);
  if (index > -1) {
    database[builder].models.splice(index, 1);
  }
  
  // Remove from specs
  delete database[builder].specs[modelName];
  
  saveDatabase();
  showModels(builder);
  showSaveIndicator(`Model "${modelName}" deleted`);
}

// ========== SPECIFICATION MANAGEMENT ==========

function renderSpecsTable(builder, model, specs) {
  const table = document.getElementById('specs-table');
  table.innerHTML = '<tr><th>Category</th><th>Value / Link</th><th>Actions</th></tr>';
  
  if (!specs.data || Object.keys(specs.data).length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3" style="text-align: center; padding: 40px; color: #999;">No specifications yet. Add some!</td>';
    table.appendChild(tr);
    return;
  }
  
  Object.keys(specs.data).forEach(key => {
    addSpecRow(table, builder, model, key, specs.data[key]);
  });
}

function addSpecRow(table, builder, model, key, value) {
  const tr = document.createElement('tr');
  tr.className = 'spec-row';
  
  // Category cell
  const categoryCell = document.createElement('td');
  const categoryInput = document.createElement('input');
  categoryInput.type = 'text';
  categoryInput.value = key;
  categoryInput.className = 'category-input';
  categoryInput.placeholder = 'Enter category name...';
  
  // Clear placeholder text when user starts typing
  categoryInput.addEventListener('focus', function() {
    if (this.value === 'New Specification' || this.value.startsWith('New Specification ')) {
      this.value = '';
    }
  });
  
  // Save on change
  categoryInput.addEventListener('change', () => {
    if (!categoryInput.value.trim()) {
      alert('Category name cannot be empty');
      categoryInput.value = key;
      return;
    }
    updateSpecKey(builder, model, key, categoryInput.value);
  });
  
  // Save on Enter key
  categoryInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      categoryInput.blur(); // Triggers change event
    }
  });
  
  categoryCell.appendChild(categoryInput);
  
  // Value cell
  const valueCell = document.createElement('td');
  const valueInput = document.createElement('textarea');
  valueInput.value = value;
  valueInput.className = 'value-input';
  valueInput.rows = 2;
  valueInput.placeholder = 'Enter value or paste link...';
  
  // Clear placeholder text when user starts typing
  valueInput.addEventListener('focus', function() {
    if (this.value === 'Enter value here...') {
      this.value = '';
    }
  });
  
  valueInput.addEventListener('change', () => {
    updateSpecValue(builder, model, key, valueInput.value);
  });
  
  // Auto-save on blur (when user clicks away)
  valueInput.addEventListener('blur', () => {
    updateSpecValue(builder, model, key, valueInput.value);
  });
  
  valueCell.appendChild(valueInput);
  
  // Actions cell
  const actionsCell = document.createElement('td');
  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteBtn.className = 'table-action-btn delete-row-btn';
  deleteBtn.title = 'Delete this specification';
  deleteBtn.onclick = () => deleteSpec(builder, model, key);
  
  actionsCell.appendChild(deleteBtn);
  
  tr.appendChild(categoryCell);
  tr.appendChild(valueCell);
  tr.appendChild(actionsCell);
  table.appendChild(tr);
}

function updateSpecKey(builder, model, oldKey, newKey) {
  if (!newKey.trim()) {
    alert('Category name cannot be empty');
    return;
  }
  
  const specs = database[builder].specs[model];
  if (!specs.data) specs.data = {};
  
  if (newKey !== oldKey && specs.data[newKey]) {
    alert('A category with this name already exists');
    return;
  }
  
  specs.data[newKey] = specs.data[oldKey];
  if (newKey !== oldKey) {
    delete specs.data[oldKey];
  }
  
  saveDatabase();
  renderSpecsTable(builder, model, specs);
}

function updateSpecValue(builder, model, key, value) {
  const specs = database[builder].specs[model];
  if (!specs.data) specs.data = {};
  specs.data[key] = value;
  saveDatabase();
}

function deleteSpec(builder, model, key) {
  if (confirm(`Delete specification "${key}"?`)) {
    const specs = database[builder].specs[model];
    if (specs.data && specs.data[key]) {
      delete specs.data[key];
      saveDatabase();
      renderSpecsTable(builder, model, specs);
    }
  }
}

function addNewSpecification(builder, model) {
  const specs = database[builder].specs[model];
  if (!specs.data) specs.data = {};
  
  // Create a unique temporary key
  let newKey = '';
  let counter = 1;
  const baseKey = 'New Specification';
  
  // Find a unique name
  do {
    newKey = counter === 1 ? baseKey : `${baseKey} ${counter}`;
    counter++;
  } while (specs.data[newKey]);
  
  // Add with empty values
  specs.data[newKey] = '';
  saveDatabase();
  renderSpecsTable(builder, model, specs);
  
  // Focus on the new row's category input and select all text
  setTimeout(() => {
    const lastRow = document.querySelector('.spec-row:last-child');
    if (lastRow) {
      const categoryInput = lastRow.querySelector('.category-input');
      if (categoryInput) {
        categoryInput.focus();
        categoryInput.select();
      }
    }
  }, 50);
}

// ========== BUTTON SETUP FUNCTIONS ==========

function setupImageUpload(builder, model, img, specs) {
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('image-upload');
  
  uploadBtn.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        img.src = base64;
        specs.image = base64;
        saveDatabase();
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };
}

function setupResetPhotoButton(builder, model, img, specs) {
  const resetBtn = document.getElementById('reset-photo-btn');
  resetBtn.onclick = () => {
    if (confirm('Reset photo to default image?')) {
      const defaultPath = getDefaultImagePath(builder, model);
      delete specs.image;
      img.src = defaultPath || '';
      saveDatabase();
    }
  };
}

function setupResetDataButton(builder, model) {
  const resetBtn = document.getElementById('reset-data-btn');
  resetBtn.onclick = () => {
    if (confirm('Reset all specifications to default values?')) {
      database[builder].specs[model].data = {};
      saveDatabase();
      renderSpecsTable(builder, model, database[builder].specs[model]);
    }
  };
}

function setupDeleteModelButton(builder, model) {
  const deleteBtn = document.getElementById('delete-model-btn');
  deleteBtn.onclick = () => {
    showDeleteModal(
      `Delete "${model}"?`,
      `This will permanently delete the ${model} model and all its data.`,
      () => deleteModel(builder, model)
    );
  };
}

function setupAddSpecButton(builder, model) {
  const addBtn = document.getElementById('add-spec-btn');
  addBtn.onclick = () => addNewSpecification(builder, model);
  
  // Optional: Add bulk specs button
  const bulkBtn = document.getElementById('add-bulk-specs-btn');
  if (bulkBtn) {
    bulkBtn.onclick = () => showBulkAddModal(builder, model);
  }
}

function showBulkAddModal(builder, model) {
  // Create a simple modal for bulk adding
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h3>Add Multiple Specifications</h3>
      <button class="modal-close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Enter specifications (one per line, format: Category|Value)</label>
        <textarea id="bulk-specs-input" rows="10" placeholder="Machine Type|5-Axis VMC&#10;Spindle Speed|12,000 RPM&#10;Control System|Mazatrol SmoothX" style="width: 100%; font-family: monospace;"></textarea>
        <p style="font-size: 0.9em; color: #666; margin-top: 5px;">
          Example: <code>Category Name|Value goes here</code>
        </p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="cancel-btn">Cancel</button>
      <button class="save-btn">Add Specifications</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.getElementById('modal-overlay').style.display = 'block';
  modal.style.display = 'block';
  
  // Setup events
  modal.querySelector('.modal-close').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
    modal.remove();
  };
  
  modal.querySelector('.cancel-btn').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
    modal.remove();
  };
  
  modal.querySelector('.save-btn').onclick = () => {
    const input = modal.querySelector('#bulk-specs-input');
    const lines = input.value.split('\n').filter(line => line.trim());
    
    let addedCount = 0;
    lines.forEach(line => {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length >= 2) {
        const key = parts[0];
        const value = parts.slice(1).join('|'); // In case value contains |
        
        const specs = database[builder].specs[model];
        if (!specs.data) specs.data = {};
        
        // Only add if not already exists
        if (!specs.data[key]) {
          specs.data[key] = value;
          addedCount++;
        }
      }
    });
    
    if (addedCount > 0) {
      saveDatabase();
      renderSpecsTable(builder, model, database[builder].specs[model]);
      showSaveIndicator(`Added ${addedCount} specification(s)`);
    } else {
      alert('No valid specifications were added. Check your format.');
    }
    
    document.getElementById('modal-overlay').style.display = 'none';
    modal.remove();
  };
}

// ========== MODAL FUNCTIONS ==========

function setupModalEvents() {
  // Add Builder Modal
  const addBuilderBtn = document.getElementById('add-builder-btn');
  if (addBuilderBtn) {
    addBuilderBtn.onclick = () => {
      document.getElementById('builder-name').value = '';
      document.getElementById('builder-logo').value = '';
      showModal('add-builder-modal');
    };
  }
  
  const addBuilderSaveBtn = document.querySelector('#add-builder-modal .save-btn');
  if (addBuilderSaveBtn) {
    addBuilderSaveBtn.onclick = () => {
      const name = document.getElementById('builder-name').value.trim();
      const logo = document.getElementById('builder-logo').value.trim();
      addNewBuilder(name, logo);
      hideModal('add-builder-modal');
    };
  }
  
  // Add Model Modal
  const addModelBtn = document.getElementById('add-model-btn');
  if (addModelBtn) {
    addModelBtn.onclick = () => {
      document.getElementById('model-name').value = '';
      document.getElementById('default-image').value = 'images/';
      showModal('add-model-modal');
    };
  }
  
  const addModelSaveBtn = document.querySelector('#add-model-modal .save-btn');
  if (addModelSaveBtn) {
    addModelSaveBtn.onclick = () => {
      const name = document.getElementById('model-name').value.trim();
      const image = document.getElementById('default-image').value.trim();
      addNewModel(currentBuilder, name, image);
      hideModal('add-model-modal');
    };
  }
  
  // Close buttons
  document.querySelectorAll('.modal-close, .cancel-btn').forEach(btn => {
    btn.onclick = (e) => {
      const modal = e.target.closest('.modal');
      if (modal) {
        hideModal(modal.id);
      }
    };
  });
  
  // Overlay click
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.onclick = () => {
      hideAllModals();
    };
  }
}

function showModal(modalId) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById(modalId);
  
  if (overlay) overlay.style.display = 'block';
  if (modal) modal.style.display = 'block';
}

function hideModal(modalId) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById(modalId);
  
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

function hideAllModals() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.style.display = 'none';
  
  document.querySelectorAll('.modal').forEach(modal => {
    modal.style.display = 'none';
  });
}

function showDeleteModal(title, message, callback) {
  const deleteTitle = document.getElementById('delete-title');
  const deleteMessage = document.getElementById('delete-message');
  
  if (deleteTitle) deleteTitle.textContent = title;
  if (deleteMessage) deleteMessage.textContent = message;
  
  deleteCallback = callback;
  
  const deleteBtn = document.querySelector('#delete-modal .delete-confirm-btn');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (deleteCallback) deleteCallback();
      hideModal('delete-modal');
    };
  }
  
  showModal('delete-modal');
}

// ========== SAVE INDICATOR ==========

function showSaveIndicator(message) {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;
  
  indicator.innerHTML = `<i class="fas fa-check"></i> ${message}`;
  indicator.classList.add('show');
  
  setTimeout(() => {
    indicator.classList.remove('show');
  }, 3000);
}

// ========== EVENT LISTENERS ==========

// Back buttons
const backToBuildersBtn = document.getElementById('back-to-builders');
if (backToBuildersBtn) {
  backToBuildersBtn.onclick = (e) => { 
    e.preventDefault();
    e.stopPropagation();
    showBuilders(); 
  };
}

const backToModelsBtn = document.getElementById('back-to-models');
if (backToModelsBtn) {
  backToModelsBtn.onclick = (e) => { 
    e.preventDefault();
    e.stopPropagation();
    showModels(currentBuilder); 
  };
}

// Mobile menu
const mobileToggleBtn = document.getElementById('mobile-toggle');
if (mobileToggleBtn) {
  mobileToggleBtn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

const toggleBtn = document.getElementById('toggle-btn');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Only on detail page
  if (document.getElementById('detail-page').style.display !== 'block') return;
  
  // Ctrl/Cmd + N to add new spec
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    addNewSpecification(currentBuilder, currentModel);
  }
  
  // Esc to cancel editing (if focused on input)
  if (e.key === 'Escape') {
    const activeElement = document.activeElement;
    if (activeElement.classList.contains('category-input') || 
        activeElement.classList.contains('value-input')) {
      activeElement.blur();
    }
  }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
  console.log('Popstate event:', event.state);
  
  if (event.state) {
    switch(event.state.page) {
      case 'builders':
        showBuilders();
        break;
      case 'models':
        if (event.state.builder) {
          showModels(event.state.builder);
        } else {
          showBuilders();
        }
        break;
      case 'detail':
        if (event.state.builder && event.state.model) {
          showDetail(event.state.builder, event.state.model);
        } else if (event.state.builder) {
          showModels(event.state.builder);
        } else {
          showBuilders();
        }
        break;
      default:
        showBuilders();
    }
  } else {
    // Default to builders page
    showBuilders();
  }
});


// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  
  // Add reload button event listener
  const reloadDbBtn = document.getElementById('reload-db-btn');
  if (reloadDbBtn) {
    reloadDbBtn.addEventListener('click', forceReloadDatabase);
  }
  
  // Add reset button event listener (REMOVED DUPLICATE)
  const resetAllBtn = document.getElementById('reset-all-btn');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', resetAllToDefault);
  }
  
  // Set initial history state
  history.replaceState({ page: 'builders' }, 'Builders', '#builders');
  
  // Parse URL hash to navigate to correct page on load
  const hash = window.location.hash;
  if (hash && hash !== '#builders') {
    // Parse hash like #builder or #builder/model
    const parts = hash.slice(1).split('/');
    
    if (parts.length === 1) {
      // Builder hash
      const builder = decodeURIComponent(parts[0]);
      if (database[builder]) {
        setTimeout(() => showModels(builder), 100);
      }
    } else if (parts.length === 2) {
      // Builder/model hash
      const builder = decodeURIComponent(parts[0]);
      const model = decodeURIComponent(parts[1]);
      
      // Check if both exist in database
      if (database[builder] && database[builder].models && 
          database[builder].models.includes(model)) {
        setTimeout(() => showDetail(builder, model), 100);
      } else if (database[builder]) {
        setTimeout(() => showModels(builder), 100);
      }
    }
  }
  
  // Load the database
  loadDatabase();
});


