const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.createBooking = functions
    .https.onCall(async (data, context) => {
      // --- 1. Validación de Datos ---
      console.log("🍒", data.data);
      const {
        professionalId,
        serviceId,
        selectedSlot,
        clientName,
        clientEmail,
        clientPhone,
        serviceName,
        serviceDuration,
      } = data.data;

      if (
        !professionalId ||
      !serviceId ||
      !selectedSlot ||
      !clientName ||
      !clientEmail ||
      !serviceName ||
      !serviceDuration
      ) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Faltan datos esenciales para crear la reserva.",
        );
      }

      const slotDate = new Date(selectedSlot);

      try {
      // --- 2. Lógica de Buscar o Crear Cliente ---
        let clientId;
        const clientsRef = db.collection("clients");
        const q = clientsRef
            .where("email", "==", clientEmail.toLowerCase())
            .where("professionalId", "==", professionalId)
            .limit(1);

        const querySnapshot = await q.get();

        if (querySnapshot.empty) {
          // --- 👇 AQUÍ ESTÁ LA MODIFICACIÓN ---
          // El cliente no existe, lo creamos junto con su historial
          const batch = db.batch();

          // 1. Referencia al nuevo documento de cliente
          const newClientRef = db.collection("clients").doc();
          clientId = newClientRef.id;

          // 2. Referencia al nuevo documento de historial
          const historyRef = newClientRef.collection("history").doc();

          // 3. Añadimos la creación del cliente al batch
          batch.set(newClientRef, {
            professionalId: professionalId,
            name: clientName,
            email: clientEmail.toLowerCase(),
            phone: clientPhone || "",
            notes: "Cliente registrado desde el portal público.",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 4. Añadimos la entrada de historial al batch
          batch.set(historyRef, {
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userId: professionalId, // El profesional que "creó" al cliente
            action: "Creación",
            changes: "Cliente registrado en el sistema.",
          });

          // 5. Ejecutamos el batch
          await batch.commit();
        } else {
          // El cliente ya existe, solo usamos su ID
          clientId = querySnapshot.docs[0].id;
        }

        // --- 3. Lógica para Crear la Cita ---
        const appointmentsRef = db.collection("appointments");
        const slotEndDate = new Date(
            slotDate.getTime() + serviceDuration * 60000,
        );
        await appointmentsRef.add({
          professionalId: professionalId,
          serviceId: serviceId,
          clientId: clientId,
          start: admin.firestore.Timestamp.fromDate(slotDate),
          end: admin.firestore.Timestamp.fromDate(slotEndDate),
          title: serviceName,
          status: "pending",
          notes: "",
          color: {primary: "#ffc107", secondary: "#FFF3CD"},
        });

        return {success: true, message: "Reserva creada exitosamente."};
      } catch (error) {
        console.error("Error en createBooking:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Ocurrió un error al procesar la reserva. Contacta al soporte.",
            error,
        );
      }
    });
