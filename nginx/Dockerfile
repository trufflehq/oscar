FROM nginx:alpine

WORKDIR /etc/nginx

# remove the default
RUN rm conf.d/default.conf

# move over our config
COPY nginx.conf .
COPY conf.d/ conf.d/
COPY ssl/ ssl/
