FROM node:18-alpine AS frontend-build

WORKDIR /app

COPY package*.json ./
COPY vite.config.* ./
COPY index.html ./
COPY public ./public
COPY src ./src

RUN npm install
RUN npm run build

FROM php:8.2-apache

RUN docker-php-ext-install pdo pdo_mysql mysqli
RUN a2enmod rewrite && \
    sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

WORKDIR /var/www/html

COPY . .
COPY --from=frontend-build /app/dist/ /var/www/html/

EXPOSE 80

