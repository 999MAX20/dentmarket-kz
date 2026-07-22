self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "DentMarket", { body: data.body || "Новое уведомление", data: data.data || {}, tag: data.notificationId || "dentmarket" }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow("/")); });
