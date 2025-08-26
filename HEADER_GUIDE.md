# GUIDA HEADER DELLE PAGINE - SISTEMA TALON

## Soluzione Centralizzata per Header Sotto Header TALON

Il sistema CSS centralizzato è già implementato in `F:\talon_app\static\css\base\template.css` e gestisce automaticamente il posizionamento degli header delle pagine.

## ✅ FUNZIONA AUTOMATICAMENTE

Gli header esistenti nei template vengono **automaticamente stilizzati** grazie al selettore CSS:

```css
.container-fluid > .row > .col-12 > .d-flex.justify-content-between.align-items-center
```

## 🎯 OPZIONE 1: Struttura Esistente (Auto-styling)

**Template corrente (es. impostazioni.html):**
```html
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2><i class="fas fa-cogs"></i> Impostazioni Sistema</h2>
            </div>
        </div>
    </div>
    <!-- contenuto pagina -->
</div>
```

**Risultato:** Header automaticamente stilizzato sotto header TALON!

## 🚀 OPZIONE 2: Nuova Struttura Ottimizzata

**Per nuovi template o refactoring:**
```html
<div class="page-content-header">
    <h2><i class="fas fa-cogs"></i> Impostazioni Sistema</h2>
    <div class="header-actions">
        <button class="btn btn-primary">Azione</button>
    </div>
</div>
<div class="container-fluid">
    <!-- contenuto pagina -->
</div>
```

## 🎨 Caratteristiche

### **Styling Automatico:**
- ✅ Posizionato sotto header TALON (96px)
- ✅ Background bianco con shadow
- ✅ Border bottom coordinato
- ✅ Icone e titoli allineati
- ✅ Responsive per mobile

### **Breadcrumbs Supportati:**
```html
<div class="page-content-header">
    <h2>Titolo Pagina</h2>
    <nav class="breadcrumb">
        <span class="breadcrumb-item"><a href="/">Home</a></span>
        <span class="breadcrumb-item active">Pagina Corrente</span>
    </nav>
</div>
```

## 🔧 Modifiche Principali

### **main-content aggiornato:**
- `overflow-y: auto` - Scroll verticale abilitato
- `padding: 20px 30px` - Padding interno standard
- Altezza calcolata per footer fisso

### **Auto-targeting CSS:**
Il selettore CSS intercetta automaticamente la struttura Bootstrap esistente nei template e applica gli stili corretti.

## 📱 Mobile Responsive

Su mobile (< 768px):
- Header si adatta alla larghezza schermo
- Padding ridotto per spazio ottimale
- Testo e icone ridimensionati

## ✅ RISULTATO

**TUTTI I TEMPLATE ESISTENTI** ora hanno automaticamente:
1. Header posizionati sotto header TALON
2. Styling consistente e professionale  
3. Responsive design
4. Shadow e border coordinati

**NESSUNA MODIFICA AI TEMPLATE RICHIESTA** - funziona out-of-the-box!