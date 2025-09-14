ARG IMAGE=nginx:alpine
FROM $IMAGE
LABEL authors="abhinavkbij"

USER=root

# ssl_certificate
COPY /etc/letsencrypt/live/ocr.backend.bijarnia.in/fullchain.pem /etc/letsencrypt/live/ocr.backend.bijarnia.in/fullchain.pem
# ssl_certificate_key
COPY /etc/letsencrypt/live/ocr.backend.bijarnia.in/privkey.pem /etc/letsencrypt/live/ocr.backend.bijarnia.in/privkey.pem
# include
COPY /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/options-ssl-nginx.conf
 # ssl_dhparam
COPY /etc/letsencrypt/ssl-dhparams.pem /etc/letsencrypt/ssl-dhparams.pem

