FROM python:3.9 as requirements-stage

WORKDIR /tmp

RUN pip install poetry --disable-pip-version-check --root-user-action=ignore

COPY ./pyproject.toml ./poetry.lock* /tmp/

RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

FROM python:3.9 as app-stage

WORKDIR /code

COPY --from=requirements-stage /tmp/requirements.txt /code/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt --disable-pip-version-check --root-user-action=ignore

COPY ./app /code/app
